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

/** TMDb日本語訳の誤訳を自然な日本語に上書きするマップ */
export const GENRE_NAME_OVERRIDES: Record<string, string> = {
  履歴: '歴史',
  謎: 'ミステリー',
  西洋: '西部劇',
};
