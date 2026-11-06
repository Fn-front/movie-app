-- delete_expired_rate_limits に保持期間の下限ガードを入れる（#933 レビュー指摘）
--
-- 背景:
--   `make_interval(hours => -5)` は `-05:00:00` を返すため、
--   `now() - (-5時間)` は**未来の時刻**になる。結果
--   `last_attempt_at < 未来` が全行で真になり、**ロック中以外の全行が消える**。
--   0 を渡した場合も同様に、ロックが明けている行をすべて消す。
--
--   呼べるのは service_role のみで、本番は定数（RATE_LIMIT_RETENTION_HOURS）を
--   渡すため現時点の実害経路は無い。ただし E2E ヘルパー
--   （`runDeleteExpiredRateLimits`）は任意値を受け取るので、誤用で共有DB上の
--   ロックを一括解除しうる。黙って全消しするより落とす。
--
--   NULL は `make_interval` が NULL を返し比較も NULL になるため0件で安全だが、
--   「意図せず何も消えていない」のも気づきにくいので同じく弾く。
--
-- ⚠️ DROP FUNCTION → CREATE は使わない。PUBLIC / anon / authenticated への
--   既定付与が復活する（.claude/rules/supabase-db.md）。CREATE OR REPLACE は
--   既存権限を保持するため、権限の再設定は不要。

CREATE OR REPLACE FUNCTION public.delete_expired_rate_limits(
  retention_hours INTEGER DEFAULT 48
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

  DELETE FROM rate_limits
  WHERE last_attempt_at < now() - make_interval(hours => retention_hours)
    AND (locked_until IS NULL OR locked_until < now());

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
