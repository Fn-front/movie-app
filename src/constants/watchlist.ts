/**
 * ウォッチリスト関連の定数
 */

import { errorMessage } from './common';

/**
 * ウォッチリストのデフォルト取得件数
 */
export const WATCHLIST_DEFAULT_LIMIT = 20;

/**
 * ウォッチリストの最大取得件数
 */
export const WATCHLIST_MAX_LIMIT = 50;

const TARGET = 'ウォッチリスト';

/**
 * ウォッチリストエラーメッセージ
 */
export const WATCHLIST_ERROR_MESSAGES = {
  FETCH_FAILED: errorMessage.fetchFailed(TARGET),
  ADD_FAILED: errorMessage.addFailed(TARGET),
  REMOVE_FAILED: errorMessage.removeFailed(TARGET),
  ALREADY_EXISTS: 'この映画はすでにウォッチリストに追加されています',
  NOT_FOUND: 'ウォッチリストに見つかりません',
  INVALID_QUERY: errorMessage.invalid('クエリパラメータ'),
  INVALID_BODY: errorMessage.invalid('入力内容'),
} as const;
