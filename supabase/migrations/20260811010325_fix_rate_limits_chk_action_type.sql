-- rate_limits.chk_action_type を、現在アプリが使用中の全 action_type に合わせて更新する。
--
-- 背景:
--   20260208100000_add_password_security.sql で ('login','otp_verify','otp_resend','change_password')
--   に更新されたまま、その後追加された RATE_LIMIT_ACTION / OTP_ACTION の各値が
--   反映されておらず、大半の insert が CHECK 制約違反(23514)で拒否されていた。
--   結果として DBベースのレート制限が事実上無効化されていたため修正する。
--
-- 対象一覧:
--   OTP_ACTION (src/constants/otp.ts):
--     - registration
--     - login
--     - password_change
--   RATE_LIMIT_ACTION (src/constants/rateLimit.ts):
--     - write_api_favorites / write_api_watchlist / write_api_dismissed_movies
--     - write_api_profile / write_api_settings
--     - read_api_theaters / read_api_theater_detail
--     - awards_fetch / suggest_title / register / change_password
--   Legacy (旧値: 既存レコードとの互換のため残置):
--     - otp_verify / otp_resend

ALTER TABLE rate_limits
  DROP CONSTRAINT IF EXISTS chk_action_type;

ALTER TABLE rate_limits
  ADD CONSTRAINT chk_action_type CHECK (
    action_type IN (
      -- OTP_ACTION
      'registration',
      'login',
      'password_change',
      -- RATE_LIMIT_ACTION
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
      -- legacy
      'otp_verify',
      'otp_resend'
    )
  );
