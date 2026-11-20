-- delete_expired_rate_limits に削除件数の上限を足す（#1330）
--
-- 背景:
--   この RPC は PostgREST 経由で呼ばれるため、`authenticator` ロールの
--   `statement_timeout = 8s` が効く（本番で実測）。
--
--     authenticator : session_preload_libraries=safeupdate
--                     statement_timeout=8s lock_timeout=8s
--
--   ⚠️ `SET ROLE` ではロール設定が再適用されないため、service_role へ
--   切り替わっても 8s のままになる（PostgreSQL の仕様）。
--
--   現行は LIMIT もループも無い単発の DELETE で、8秒を超えると `57014` が出て
--   **トランザクションごとロールバック**する。1行も消えないまま翌日はさらに
--   大きいテーブルを相手にすることになり、一度入ると自力で回復しない。
--   #933 が個人情報保護法22条を根拠に入れた48時間消去が恒久停止する。
--
-- 対応:
--   1回あたりの削除件数に上限を設ける。呼び出し側（cleanupRateLimits.ts）が
--   「削除件数が上限未満になるまで」繰り返す。
--
--   ⚠️ plpgsql の中でループしても意味がない。`statement_timeout` は RPC 全体に
--   掛かるため、分割は**クライアント側**で行う必要がある。
--
-- ⚠️ DROP → CREATE にしている理由:
--   引数を足すとシグネチャが変わる。`CREATE OR REPLACE` だと 1引数版と
--   2引数版が併存し、`f(retention_hours => 48)` の解決が
--   「function is not unique」で曖昧になる。古い方を落とすしかない。
--
--   `.claude/rules/supabase-db.md` のとおり、DROP → CREATE では既定付与が
--   復活しうるため**権限を書き直す**。

DROP FUNCTION IF EXISTS public.delete_expired_rate_limits(INTEGER);

CREATE OR REPLACE FUNCTION public.delete_expired_rate_limits(
  retention_hours INTEGER DEFAULT 48,
  p_limit INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- `make_interval(hours => -5)` は `-05:00:00` を返すため `now() - (-5時間)` が
  -- 未来になり、ロック中以外の全行が消える。0 も同様（20261106112019）
  IF retention_hours IS NULL OR retention_hours <= 0 THEN
    RAISE EXCEPTION
      'retention_hours must be a positive integer (got %)', retention_hours;
  END IF;

  -- 0 や負数を渡されると「1件も消さないのに成功」を返し、呼び出し側の
  -- ループが即座に打ち切られる。黙って何も消さないより落とす
  IF p_limit IS NOT NULL AND p_limit <= 0 THEN
    RAISE EXCEPTION
      'p_limit must be a positive integer when given (got %)', p_limit;
  END IF;

  IF p_limit IS NULL THEN
    -- 従来どおり一括。呼び出し側が上限を渡さない場合の後方互換
    DELETE FROM rate_limits
    WHERE last_attempt_at < now() - make_interval(hours => retention_hours)
      AND (locked_until IS NULL OR locked_until < now());
  ELSE
    -- ctid で対象を先に確定させてから消す。
    -- DELETE ... LIMIT は PostgreSQL に無いため、サブクエリで絞る
    DELETE FROM rate_limits
    WHERE ctid IN (
      SELECT ctid FROM rate_limits
      WHERE last_attempt_at < now() - make_interval(hours => retention_hours)
        AND (locked_until IS NULL OR locked_until < now())
      LIMIT p_limit
    );
  END IF;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 公開キーから到達できないようにする。
-- CREATE FUNCTION が PUBLIC へ自動付与する分と、Supabase の既定権限で
-- anon / authenticated へ付く分の両方を剥がす（片方だけでは素通りする）。
REVOKE EXECUTE ON FUNCTION public.delete_expired_rate_limits(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_rate_limits(INTEGER, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.delete_expired_rate_limits(INTEGER, INTEGER) IS
  'rate_limits の保持期間切れ行を削除する。ロック中の行は残す。p_limit を渡すと1回の削除件数を制限する（呼び出し側がループする前提。statement_timeout=8s 対策 / #1330）。日次CRONから呼ぶ（#933）';
