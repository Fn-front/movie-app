-- rate_limits の保持期間切れ行を削除する RPC を追加する（#933）
--
-- 背景:
--   rate_limits には identifier としてメールアドレス・IPアドレス・ユーザーIDが
--   入る。成功時の個別削除（resetRateLimit / src/lib/rateLimit/rateLimit.ts）は
--   あるが、期限切れ行の定期削除が無く、レート制限という目的を達した後も
--   識別子が残り続けていた（個人情報保護法22条）。
--
-- 削除条件:
--   `last_attempt_at` が保持期間より古く、**かつ** ロックが明けている行だけを消す。
--
--   1. created_at を基準にしない。行は consume_rate_limit の upsert で再利用され、
--      created_at は初回作成時刻のまま（20261019013008）。created_at 基準だと
--      カウント中の行まで消える。
--   2. ロック中の行を消さない。locked_until は最大で now + ウィンドウ（最長24h先）。
--      ロック中は last_attempt_at を更新しない仕様のため（同ファイル）、
--      last_attempt_at だけを見るとロックが早期解除される。
--
--   なお `last_attempt_at` と `locked_until` はどちらも TIMESTAMPTZ 済み
--   （20260628111105 / 20261019012324）なので、now() との比較で
--   セッションTZ依存の暗黙キャストは起きない。created_at / updated_at は
--   naive TIMESTAMP のままだが、条件に使わないため影響しない。

-- 削除条件に合う索引
--
-- 既存は (identifier, action_type) の UNIQUE と locked_until のみで、
-- last_attempt_at の範囲検索に使える索引が無い。
CREATE INDEX IF NOT EXISTS idx_rate_limits_last_attempt_at
  ON rate_limits(last_attempt_at);

-- 保持期間を過ぎたレート制限行を削除する
--
-- 日次CRON（/api/cron/cleanup-rate-limits）から service_role で呼び出す。
-- SECURITY INVOKER のままで足りる（呼び出しロールの権限で動く）。
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
  DELETE FROM rate_limits
  WHERE last_attempt_at < now() - make_interval(hours => retention_hours)
    AND (locked_until IS NULL OR locked_until < now());

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 公開キーから到達できないようにする。
-- CREATE FUNCTION が PUBLIC へ自動付与する分と、Supabase の既定権限で
-- anon / authenticated へ付く分の両方を剥がす（片方だけでは素通りする）。
REVOKE EXECUTE ON FUNCTION public.delete_expired_rate_limits(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_rate_limits(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.delete_expired_rate_limits(INTEGER) IS
  'rate_limits の保持期間切れ行を削除する。ロック中の行は残す。日次CRONから呼ぶ（#933）';

COMMENT ON TABLE rate_limits IS
  'レート制限のカウンタ。保持期間は48時間で、日次CRONが超過分を削除する（#933）。最長ウィンドウ（OTP_SEND_DAILY = 1440分）がちょうど24時間のため、24時間では足りない';
