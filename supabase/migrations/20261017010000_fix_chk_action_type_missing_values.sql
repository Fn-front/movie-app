-- ============================================
-- rate_limits.chk_action_type の許可リスト漏れを修正
-- ============================================
-- 背景:
-- 20260811010325 で許可リストを更新した際、以下2つが漏れていた。
--   - otp_send_daily       （src/app/api/auth/otp/send/route.ts の日次送信上限）
--   - recommendation_refresh（src/app/api/recommendations/refresh/route.ts のクールダウン）
--
-- checkRateLimit / checkCooldown は初回 INSERT の戻り値を見ていなかったため、
-- CHECK 制約違反（23514）が握り潰され、カウンタ行が永久に作られず
-- 毎回 allowed: true を返していた。つまり上記2つの制限は**恒常的に無効**だった。
--
-- これは 20260811010325 が修正したのと同一クラスの事故の再発（#546 → #659）。
-- 同じことを三度繰り返さないため、本マイグレーションと同時に次も入れている:
--   - checkRateLimit / checkCooldown / resetRateLimit の actionType を
--     RateLimitActionType 型で制約（許可リスト外はコンパイルエラー）
--   - INSERT 失敗時に console.error で記録（23514 は専用メッセージ）
--   - otp_send_daily / otp_verify を RATE_LIMIT_ACTION に定数化（直書きの解消）

ALTER TABLE rate_limits
  DROP CONSTRAINT IF EXISTS chk_action_type;

ALTER TABLE rate_limits
  ADD CONSTRAINT chk_action_type CHECK (
    action_type IN (
      -- OTP_ACTION（src/constants/otp.ts）
      'registration',
      'login',
      'password_change',
      -- RATE_LIMIT_ACTION（src/constants/rateLimit.ts）
      'write_api_favorites',
      'write_api_watchlist',
      'write_api_dismissed_movies',
      'write_api_profile',
      'write_api_settings',
      'read_api_theaters',
      'read_api_theater_detail',
      'awards_fetch',
      'suggest_title',
      'register',
      'change_password',
      'recommendation_refresh',  -- 20260811010325 で漏れていた
      'otp_send_daily',          -- 20260811010325 で漏れていた（定数化されておらず監査から漏れた）
      'otp_verify',
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める（外すと ADD CONSTRAINT が既存行の検証で失敗する）
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'src/constants/rateLimit.ts の RateLimitActionType と必ず一致させること。許可リストから漏れると該当の制限が無言で無効化される（#546 / #659）。';
