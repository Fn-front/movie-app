-- ============================================
-- chk_action_type に login_ip を追加
-- ============================================
-- 背景:
-- ログインのレート制限がメールアドレス単独を識別子にしていたため、認証情報を
-- 一切知らない第三者が誤ったパスワードを数回送るだけで、任意のアカウントを
-- ロックできた（攻撃側のコストはゼロ、被害側は締め出し／#644）。
--
-- 対策として識別子を「メールアドレス|送信元IP」に変更し、送信元単位の
-- レート制限（login_ip）を併用する。前者でロックされるのは試行した本人だけに
-- なり、後者が1つの送信元からの大量試行を止める。
--
-- ⚠️ 許可リストは src/constants/rateLimit.ts の RateLimitActionType と
-- 必ず一致させること。漏れるとその制限が無言で無効化される（#546 / #659）。

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
      'recommendation_refresh',
      'otp_send_daily',
      'otp_verify',
      'login_ip',  -- 本マイグレーションで追加（#644）
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'src/constants/rateLimit.ts の RateLimitActionType と必ず一致させること。許可リストから漏れると該当の制限が無言で無効化される（#546 / #659）。';

-- 識別子の形式が「email」から「email|ip」に変わるため、既存の login 行は
-- 対応関係を失う。残っていてもロック解除待ちの行が宙に浮くだけなので削除する。
DELETE FROM rate_limits WHERE action_type = 'login';
