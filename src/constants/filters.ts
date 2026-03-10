/**
 * フィルター関連の定数
 */

import { errorMessage } from './common';

const TARGET = 'フィルター条件';

/**
 * フィルターエラーメッセージ
 */
export const FILTER_ERROR_MESSAGES = {
  /** バリデーションエラー */
  VALIDATION_ERROR: errorMessage.invalid(TARGET),
  /** フィルター取得失敗 */
  FETCH_FAILED: errorMessage.fetchFailed(TARGET),
  /** フィルター保存失敗 */
  SAVE_FAILED: errorMessage.saveFailed(TARGET),
} as const;
