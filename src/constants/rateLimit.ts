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
  RECOMMENDATION_REFRESH: 'recommendation_refresh',
  /** ログイン試行の送信元単位の上限（IPアドレス単位） */
  LOGIN_IP: 'login_ip',
  /** OTP の日次送信上限（メールアドレス単位） */
  OTP_SEND_DAILY: 'otp_send_daily',
  /** OTP 検証試行の上限（メールアドレス単位。OTP行の attempts とは独立した多層防御） */
  OTP_VERIFY: 'otp_verify',
} as const;

/**
 * `rate_limits.action_type` に入れてよい値。
 *
 * DB 側の `chk_action_type` CHECK 制約の許可リストと**必ず一致させること**。
 * 許可リストに無い値で INSERT すると 23514 で失敗し、その制限が無言で
 * 機能しなくなる（#546 / #659 で2度発生）。`checkRateLimit` / `checkCooldown` の
 * 引数をこの型で縛ることで、同じ事故をコンパイル時に防ぐ。
 */
export type RateLimitActionType =
  | (typeof RATE_LIMIT_ACTION)[keyof typeof RATE_LIMIT_ACTION]
  | 'registration'
  | 'login'
  | 'password_change';

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
  /**
   * ログイン試行の送信元単位の上限。
   *
   * アカウント単位（LOGIN_ACCOUNT）より緩くし、1つの送信元からの大量試行だけを
   * 止める。厳しくしすぎると、NAT や社内プロキシで同一IPを共有する正当な
   * 利用者をまとめて巻き込む。
   */
  LOGIN_IP: { maxAttempts: 20, windowMinutes: 15 },
  /**
   * ログイン試行のアカウント×送信元単位の上限。
   *
   * 識別子に送信元を含めるため、第三者が誤ったパスワードを試しても
   * **その第三者自身がロックされるだけ**で、正当な利用者は締め出されない（#644）。
   */
  LOGIN_ACCOUNT: { maxAttempts: 5, windowMinutes: 30 },
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
