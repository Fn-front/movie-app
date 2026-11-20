-- delete_expired_rate_limits の削除条件の二重管理をなくす（#1342）
--
-- 20261120005128 は `p_limit IS NULL` で分岐し、**同じ削除条件を2箇所に**
-- 書いていた。これが危ない。
--
--   E2E（e2e/rateLimit/rateLimitsRetention.spec.ts:98）は
--   `runDeleteExpiredRateLimits(RETENTION_HOURS)` を引数1つで呼ぶため、
--   検証しているのは **`p_limit IS NULL` 側だけ**。jest は supabase を
--   丸ごとモックするので SQL に触れない。
--
--   つまり**本番が実際に通る ctid 側は、どのテストでも実行されていない**。
--   ctid 側の `AND (locked_until IS NULL OR locked_until < now())` を
--   誰かが落としても E2E は緑のまま通り、**本番だけロック中の行が消える**
--   （＝ロックの早期解除）。spec 自身がコメントで「ここが固定しているのは
--   SQL の AND (locked_until ...) 節が効いていること」と書いている保護が、
--   本番経路には掛かっていなかった。
--
-- 対応:
--   PostgreSQL は `LIMIT NULL` を「上限なし」として扱う。本番 17.6 で実測:
--
--     limit_null  limit_5  all_rows
--     1160        5        1160
--
--   したがって分岐は不要で、ctid 版1本に統合できる。後方互換は保たれる
--   （`p_limit` 省略 → NULL → 上限なし → 従来どおり全件削除）。
--
-- ⚠️ CREATE OR REPLACE で本体だけ差し替える。シグネチャは変えないので
--   DROP は不要＝既存権限（service_role のみ）がそのまま保持される。
--   20261120005128 が DROP → CREATE だったのは引数を増やしたため。

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

  -- ⚠️ 削除条件はここ1箇所だけにすること（#1342）。
  --   `LIMIT p_limit` は NULL なら上限なしとして働くので、分岐は要らない。
  --
  -- ⚠️ `ctid` を使う理由: 素朴な `id IN (SELECT id ... LIMIT n)` にすると、
  --   同時 UPDATE された行が EvalPlanQual の再検査を**通過して**しまい、
  --   「たった今カウントし直された行」を消す＝レート制限が黙って弱くなる。
  --   ctid なら行が動いた時点で再検査に落ちるので安全側。
  DELETE FROM rate_limits
  WHERE ctid IN (
    SELECT ctid FROM rate_limits
    WHERE last_attempt_at < now() - make_interval(hours => retention_hours)
      AND (locked_until IS NULL OR locked_until < now())
    LIMIT p_limit
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.delete_expired_rate_limits(INTEGER, INTEGER) IS
  'rate_limits の保持期間切れ行を削除する。ロック中の行は残す。p_limit を渡すと1回の削除件数を制限する（省略時は上限なし。statement_timeout=8s 対策 / #1330・#1342）。日次CRONから呼ぶ（#933）';
