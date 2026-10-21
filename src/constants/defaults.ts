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
  /** 月のみ（年が文脈から自明な場合） */
  MONTH: 'M月',
  /** 月日＋曜日（年が文脈から自明な場合） */
  MONTH_DAY_WEEKDAY: 'M月d日(E)',
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
  /** デフォルトテーマ（未設定時は OS 設定に追従） */
  DEFAULT: 'system' as const,
} as const;

/**
 * 為替レート（概算用）
 */
export const EXCHANGE_RATE = {
  /** USD→JPY固定レート */
  USD_TO_JPY: 150,
} as const;
