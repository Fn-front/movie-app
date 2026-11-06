-- ============================================
-- chk_action_type に admin ルートのロール確認を追加する
-- ============================================
-- `withAdminAuth` はロールを JWT ではなく毎回DBから読む（JWT の role は最大5分
-- 古く、剥奪直後の管理操作を通してしまうため）。しかしその SELECT が
-- レート制限より前にあったため、**ログイン済みの非 admin が admin ルートを
-- 連打するだけで `users` を無制限に読ませられる**状態だった（#965）。
--
-- ロール確認の前に消費する専用カウンタを足す。識別子は admin 判定前の
-- セッションなので、非 admin も含めた全ログインユーザーが対象になる。
-- 各ルート固有の制限（admin_account_issue 等）は handler 内に残す。
--
-- ⚠️ 許可リストは src/constants/rateLimit.ts の RateLimitActionType と
-- 必ず一致させること。漏れるとその制限が無言で無効化される（#546 / #659 で2度発生）。
-- DROP → ADD で全量を再定義する方式のため、既存の値を1つでも落とすと
-- その制限が壊れる。追加するときは必ず既存の全値を書き写すこと。

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
      'write_api_recommendation_events',
      'login_ip',
      'otp_send_daily',
      'otp_verify',
      'totp_verify',
      'password_reset_request',
      'password_reset_confirm',
      -- 公開映画API（20261018052254 で追加）
      'read_api_movies',
      'search_api_movies',
      'read_api_movie_detail',
      'read_api_genres',
      -- 認証必須API（20261018052953 で追加）
      'write_api_filters',
      'read_api_user_data',
      -- 人物詳細API（20261020100000 で追加）
      'read_api_person_detail',
      -- 管理者発行アカウント（20261030120000 で追加）
      'admin_account_issue',
      -- 受賞作品の手動同期（20261031093154 で追加）
      'admin_award_sync',
      'admin_award_sync_status',
      -- 二段階認証の設定変更（本マイグレーションで追加）
      'totp_settings_verify',
      -- admin ルートのロール確認（本マイグレーションで追加）
      'admin_role_check',
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'rate_limits.action_type の許可リスト。src/constants/rateLimit.ts の RateLimitActionType と一致させること。漏れると該当の制限が無言で無効化される。';
