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
