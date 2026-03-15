/**
 * 興味なし映画関連の定数
 */

import { errorMessage, successMessage } from './common';

const TARGET = '興味なしリスト';

/**
 * 興味なし映画エラーメッセージ
 */
export const DISMISSED_MOVIES_ERROR_MESSAGES = {
  FETCH_FAILED: errorMessage.fetchFailed(TARGET),
  ADD_FAILED: errorMessage.addFailed(TARGET),
  REMOVE_FAILED: errorMessage.removeFailed(TARGET),
  ALREADY_EXISTS: 'この映画はすでに興味なしリストに追加されています',
  NOT_FOUND: errorMessage.notFound(TARGET),
  INVALID_BODY: errorMessage.invalid('入力内容'),
} as const;

/**
 * 興味なし映画成功メッセージ
 */
export const DISMISSED_MOVIES_SUCCESS_MESSAGES = {
  ADDED: successMessage.added(TARGET),
  REMOVED: successMessage.removed(TARGET),
} as const;
