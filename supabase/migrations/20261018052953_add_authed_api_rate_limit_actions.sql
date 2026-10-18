-- ============================================
-- chk_action_type に認証必須APIのレート制限を追加する
-- ============================================
-- .claude/rules/api-route.md は「DB-based レート制限を実装する」を必須と
-- 定めているが、認証必須でありながら制限が無いルートが4本あった。
--   - /api/filters              GET / PUT（saved_filters への書き込みあり）
--   - /api/watchlist/[id]       DELETE（論理削除）
--   - /api/watchlist/calendar   GET
--   - /api/recommendations/refresh-count  GET
--
-- とくに watchlist/[id] の DELETE は、対になる favorites/[id] の
-- PATCH / DELETE には制限があるのに片方だけ抜けており、意図的な判断ではなく
-- 実装漏れと考えられる。こちらは既存の write_api_watchlist を再利用するため
-- 新しい値は要らない。
--
-- 読み取り3本は user_id で絞ったDB読み取りのみで外部APIを呼ばないため、
-- 1つのカウンタを共有して厚めに取る。
--
-- ⚠️ 許可リストは src/constants/rateLimit.ts の RateLimitActionType と
-- 必ず一致させること。漏れるとその制限が無言で無効化される（#546 / #659 で2度発生）。
-- DROP → ADD で全量を再定義する方式のため、既存の値を1つでも落とすと
-- その制限が壊れる。追加するときは必ず既存の全値を書き写すこと。
-- 検証: node scripts/check-action-types.mjs <このファイル>

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
      -- 認証必須API（本マイグレーションで追加）
      'write_api_filters',
      'read_api_user_data',
      -- legacy: 現行コードからは使われていないが、既存行が残っている可能性が
      -- あるため許可リストに留める
      'otp_resend'
    )
  );

COMMENT ON CONSTRAINT chk_action_type ON rate_limits IS
  'rate_limits.action_type の許可リスト。src/constants/rateLimit.ts の RateLimitActionType と一致させること。漏れると該当の制限が無言で無効化される。';
