-- ============================================
-- chk_action_type に二段階認証の設定変更を追加する
-- ============================================
-- 設定画面の二段階認証操作（有効化・無効化・リカバリーコード再発行）は、
-- これまでログインの第2要素検証と同じ 'totp_verify' を消費していた。
-- 識別子もユーザーIDで同じなので、rate_limits の**同一行**を共有していた。
--
-- #940 でレート制限を検証より前に移した結果、この共有が実害に変わった。
-- 設定画面のフォームにはクライアント側の検証が無く、コード欄が空のまま
-- 送信できる。空のまま5回押すとカウンタが上限に達し、ロック中は
-- src/lib/auth/auth.ts の第2要素検証も同じ行を見るため、**正規の認証アプリの
-- コードでもログインできなくなる**。resetRateLimit は検証成功時にしか
-- 走らないので、利用者が自力で解除する手段も無い。
--
-- そこで設定画面側に専用のアクションを切り、ログインと分離する。
-- 設定画面で何回誤操作してもログインは影響を受けない。
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
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'rate_limits.action_type の許可リスト。src/constants/rateLimit.ts の RateLimitActionType と一致させること。漏れると該当の制限が無言で無効化される。';
