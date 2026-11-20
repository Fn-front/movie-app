-- otp_codes / password_reset_tokens の保持期間切れ削除 RPC（#978 / #1300）
--
-- 背景:
--   どちらもメールアドレスや資格情報を保持するテーブルなのに、**到達しなかった
--   レコードが無期限に残っていた**。消えるのは次の経路だけで、放棄されたものは
--   残り続ける。
--
--     otp_codes            … 検証成功時の即時削除 / ユーザー削除の連鎖
--     password_reset_tokens … 使用時に used_at が入るだけ（行は残る）/ 同上
--
--   個人情報保護法22条（不要となった個人データの消去の努力義務）に関わる。
--   `rate_limits` は #933 で定期削除を用意したが、この2つは対象外だった。
--
-- 設計は `delete_expired_rate_limits`（20261120033251）に揃える。
--
--   - `SECURITY INVOKER` + `SET search_path = public, pg_temp`
--   - `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` + service_role へ GRANT
--   - 保持期間の下限ガード（`<= 0` / NULL を弾く）
--   - `p_limit` で1回の削除件数を絞れる（`statement_timeout = 8s` 対策）
--   - `LIMIT p_limit` は NULL なら上限なしとして働くので分岐を書かない
--
-- ⚠️ `ctid IN (...)` を使う理由も同じ。素朴な `id IN (SELECT id ... LIMIT n)` は
--   同時 UPDATE された行が EvalPlanQual の再検査を**通過して**しまう。
--   `otp_codes` は検証のたびに `attempts` が UPDATE されるため、実際に
--   「たった今試行回数を数え直した行」を消す事故が起こりうる。
--
-- ⚠️ 削除条件に `used_at` / `verified_at` を含めない。
--   **期限切れなら使用済みかどうかに関わらず消す**。使用済みの行を残す理由は
--   「使い回しを『見つからない』ではなく『使用済み』として判定するため」だが、
--   それが要るのは有効期限の内側だけ。期限切れの行はどのみち拒否される。

-- ---------------------------------------------------------------------------
-- otp_codes（#978）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_expired_otp_codes(
  retention_hours INTEGER,
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
  -- 未来になり、**まだ有効なコードまで消える**。0 も同様
  IF retention_hours IS NULL OR retention_hours <= 0 THEN
    RAISE EXCEPTION
      'retention_hours must be a positive integer (got %)', retention_hours;
  END IF;

  -- 0 や負数だと「1件も消さないのに成功」を返し、呼び出し側のループが
  -- 即座に打ち切られる。黙って何も消さないより落とす
  IF p_limit IS NOT NULL AND p_limit <= 0 THEN
    RAISE EXCEPTION
      'p_limit must be a positive integer when given (got %)', p_limit;
  END IF;

  DELETE FROM otp_codes
  WHERE ctid IN (
    SELECT ctid FROM otp_codes
    WHERE expires_at < now() - make_interval(hours => retention_hours)
    LIMIT p_limit
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_expired_otp_codes(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_otp_codes(INTEGER, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.delete_expired_otp_codes(INTEGER, INTEGER) IS
  'otp_codes の保持期間切れ行を削除する。p_limit を渡すと1回の削除件数を制限する（省略時は上限なし）。日次CRONから呼ぶ（#978）';

-- ---------------------------------------------------------------------------
-- password_reset_tokens（#1300）
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_expired_password_reset_tokens(
  retention_hours INTEGER,
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
  IF retention_hours IS NULL OR retention_hours <= 0 THEN
    RAISE EXCEPTION
      'retention_hours must be a positive integer (got %)', retention_hours;
  END IF;

  IF p_limit IS NOT NULL AND p_limit <= 0 THEN
    RAISE EXCEPTION
      'p_limit must be a positive integer when given (got %)', p_limit;
  END IF;

  DELETE FROM password_reset_tokens
  WHERE ctid IN (
    SELECT ctid FROM password_reset_tokens
    WHERE expires_at < now() - make_interval(hours => retention_hours)
    LIMIT p_limit
  );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.delete_expired_password_reset_tokens(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.delete_expired_password_reset_tokens(INTEGER, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.delete_expired_password_reset_tokens(INTEGER, INTEGER) IS
  'password_reset_tokens の保持期間切れ行を削除する。使用済み（used_at あり）も期限切れなら消す。p_limit を渡すと1回の削除件数を制限する（#1300）';
