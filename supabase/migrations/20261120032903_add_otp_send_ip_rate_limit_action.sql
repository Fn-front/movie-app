-- chk_action_type に otp/send の送信元単位カウンタを追加する（#1341）
--
-- #1331 で未認証の認証系3ルートに IP 単位のブレーキを足したが、
-- `POST /api/auth/otp/send` が漏れていた。事後レビューでの指摘。
--
-- ⚠️ 他の3ルートとは穴の性質が違う。
--   未登録アドレスだと列挙防止の early return に落ちて OTP_SEND_DAILY の
--   消費へ到達しないため、**`rate_limits` の行は増えない**。
--   残っていたのは「1リクエストごとに users の SELECT と randomDelay() の
--   200〜500ms を、単一IPから無制限に踏ませられる」ほう。
--   列挙を防ぐために**わざと重くしている**処理なので、天井が無いと
--   そのコストがそのまま攻撃者の武器になる。
--
-- ⚠️ 許可リストは src/constants/rateLimit.ts の RateLimitActionType と
-- 必ず一致させること。漏れるとその制限が無言で無効化される（#546 / #659 で2度発生）。
-- DROP → ADD で全量を再定義する方式のため、既存の値を1つでも落とすと
-- その制限が壊れる。本ファイルの値は**本番の現行定義から機械生成**している。

ALTER TABLE rate_limits
  DROP CONSTRAINT IF EXISTS chk_action_type;

ALTER TABLE rate_limits
  ADD CONSTRAINT chk_action_type CHECK (
    action_type IN (
      'registration',
      'login',
      'password_change',
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
      'write_api_recommendation_events',
      'login_ip',
      'otp_send_daily',
      'otp_verify',
      'totp_verify',
      'password_reset_request',
      'password_reset_confirm',
      'read_api_movies',
      'search_api_movies',
      'read_api_movie_detail',
      'read_api_genres',
      'write_api_filters',
      'read_api_user_data',
      'read_api_person_detail',
      'admin_account_issue',
      'admin_award_sync',
      'admin_award_sync_status',
      'totp_settings_verify',
      'admin_role_check',
      'two_factor_send',
      'register_ip',
      'otp_verify_ip',
      'password_reset_request_ip',
      'otp_send_ip',
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'rate_limits.action_type の許可リスト。src/constants/rateLimit.ts の RateLimitActionType と一致させること。漏れると該当の制限が無言で無効化される。';
