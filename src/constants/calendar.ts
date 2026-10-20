/**
 * カレンダー関連の定数
 */

import { errorMessage } from './common';

const TARGET = 'カレンダー';

/**
 * カレンダーエラーメッセージ
 */
export const CALENDAR_ERROR_MESSAGES = {
  FETCH_FAILED: errorMessage.fetchFailed(TARGET),
  INVALID_QUERY: errorMessage.invalid('クエリパラメータ'),
} as const;

/**
 * 月グリッドの日セルに付与するクラス名
 *
 * FullCalendar 既定のクラス（fc-day-today 等）と同じ名前空間に並べるため fc- 接頭辞を踏襲する。
 * SCSS 側は :global() 経由で参照する。
 */
export const CALENDAR_DAY_CELL_CLASSES = {
  /** 公開予定がある日 */
  HAS_EVENTS: 'fc-day-has-events',
  /** 選択中の日 */
  SELECTED: 'fc-day-selected',
} as const;

/**
 * セル内に並べるイベントの最大件数。超過分は「他N件」に畳まれる
 */
export const CALENDAR_MAX_EVENTS = 2;

/**
 * カレンダーの見出しラベル
 */
export const CALENDAR_HEADINGS = {
  /** 選択日の見出し（例: 3月15日(日)（3件）） */
  selectedDate: (date: string, count: number) => `${date}（${count}件）`,
  /** 月全体の見出し（例: 3月の公開予定（5件）） */
  month: (month: string, count: number) =>
    `${month}の公開予定（${count}件）`,
} as const;

/**
 * 公開日までの距離を表すラベル
 */
export const CALENDAR_PROXIMITY_LABELS = {
  /** 公開日が当日 */
  TODAY: '本日公開',
  /** 公開日が過去 */
  RELEASED: '公開済み',
  /** 公開日が未来（残り日数） */
  upcoming: (days: number) => `あと${days}日`,
} as const;
