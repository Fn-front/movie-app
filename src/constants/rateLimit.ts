/**
 * レート制限の定数
 *
 * 各ルートに散在していた action 種別・閾値を集約する。
 */

/**
 * DB-based レート制限のアクション種別（`rate_limits.action_type` の値）。
 *
 * ⚠️ これらは DB に保存されるキーのため、値を変更しないこと（変更すると既存の
 * レート制限レコードと不整合になる）。OTP 系（registration / login / password_change 等）は
 * `OTP_ACTION`（otp.ts）を参照。
 */
export const RATE_LIMIT_ACTION = {
  WRITE_FAVORITES: 'write_api_favorites',
  WRITE_WATCHLIST: 'write_api_watchlist',
  WRITE_DISMISSED_MOVIES: 'write_api_dismissed_movies',
  WRITE_PROFILE: 'write_api_profile',
  WRITE_SETTINGS: 'write_api_settings',
  READ_THEATERS: 'read_api_theaters',
  READ_THEATER_DETAIL: 'read_api_theater_detail',
  AWARDS_FETCH: 'awards_fetch',
  SUGGEST_TITLE: 'suggest_title',
  REGISTER: 'register',
  CHANGE_PASSWORD: 'change_password',
} as const;

/**
 * DB-based レート制限の閾値プリセット（maxAttempts 回 / windowMinutes 分）。
 * checkRateLimit(supabase, id, action, maxAttempts, windowMinutes) に渡す。
 */
export const RATE_LIMIT_CONFIG = {
  WRITE_FAVORITES: { maxAttempts: 10, windowMinutes: 1 },
  WRITE_WATCHLIST: { maxAttempts: 10, windowMinutes: 1 },
  WRITE_DISMISSED_MOVIES: { maxAttempts: 10, windowMinutes: 1 },
  WRITE_PROFILE: { maxAttempts: 10, windowMinutes: 1 },
  WRITE_SETTINGS: { maxAttempts: 10, windowMinutes: 1 },
  READ_THEATERS: { maxAttempts: 30, windowMinutes: 1 },
  READ_THEATER_DETAIL: { maxAttempts: 30, windowMinutes: 1 },
  AWARDS_FETCH: { maxAttempts: 30, windowMinutes: 10 },
  SUGGEST_TITLE: { maxAttempts: 10, windowMinutes: 60 },
  REGISTER: { maxAttempts: 5, windowMinutes: 60 },
} as const;

/**
 * checkRateLimit のデフォルト閾値（呼び出しで maxAttempts/windowMinutes を
 * 省略した場合に適用。change-password はこのデフォルトを利用）。
 */
export const RATE_LIMIT_DEFAULT = {
  MAX_ATTEMPTS: 3,
  WINDOW_MINUTES: 30,
} as const;

/**
 * インメモリ・レート制限（DB を使わない軽量制限）の設定。
 * CSP レポート受信など高頻度・低コストで判定したいエンドポイント向け。
 */
export const IN_MEMORY_RATE_LIMIT = {
  CSP_REPORT: { maxRequests: 60, windowMs: 60 * 1000 },
} as const;
