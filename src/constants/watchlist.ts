/**
 * ウォッチリスト関連の定数
 */

/**
 * ウォッチリストのデフォルト取得件数
 */
export const WATCHLIST_DEFAULT_LIMIT = 20;

/**
 * ウォッチリストの最大取得件数
 */
export const WATCHLIST_MAX_LIMIT = 50;

/**
 * ウォッチリストエラーメッセージ
 */
export const WATCHLIST_ERROR_MESSAGES = {
  FETCH_FAILED: 'ウォッチリストの取得に失敗しました',
  ADD_FAILED: 'ウォッチリストへの追加に失敗しました',
  REMOVE_FAILED: 'ウォッチリストからの削除に失敗しました',
  ALREADY_EXISTS: 'この映画はすでにウォッチリストに追加されています',
  NOT_FOUND: 'ウォッチリストに見つかりません',
  INVALID_QUERY: 'クエリパラメータが不正です',
  INVALID_BODY: '入力内容に誤りがあります',
} as const;
