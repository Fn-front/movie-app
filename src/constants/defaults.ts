/**
 * デフォルト値・設定値定数
 */

/**
 * 日付フォーマット
 */
export const DATE_FORMATS = {
  /** 日付のみ */
  DATE: 'yyyy年MM月dd日',
  /** 日時 */
  DATE_TIME: 'yyyy年MM月dd日 HH:mm',
} as const;

/**
 * IntersectionObserverデフォルト設定
 */
export const INTERSECTION_OBSERVER_DEFAULTS = {
  /** ルートマージン */
  ROOT_MARGIN: '200px',
} as const;

/**
 * テーマ設定
 */
export const THEME_DEFAULTS = {
  /** デフォルトテーマ */
  DEFAULT: 'light' as const,
} as const;

/**
 * 為替レート（概算用）
 */
export const EXCHANGE_RATE = {
  /** USD→JPY固定レート */
  USD_TO_JPY: 150,
} as const;
