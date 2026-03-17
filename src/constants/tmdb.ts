/**
 * TMDb API クライアント設定
 */

/**
 * TMDb API リトライ設定
 */
export const TMDB_RETRY_CONFIG = {
  /** リトライ最大回数 */
  MAX_RETRY_COUNT: 3,
  /** リトライ待機時間（ミリ秒） */
  RETRY_DELAY_MS: 1000,
  /** リトライ対象のHTTPステータスコード */
  RETRYABLE_STATUS_CODES: [429, 503, 504] as readonly number[],
} as const;
