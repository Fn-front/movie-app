/**
 * ウォッチリスト関連の定数
 */

import { errorMessage, successMessage } from './common';

/**
 * ウォッチリストのデフォルト取得件数
 */
export const WATCHLIST_DEFAULT_LIMIT = 20;

/**
 * ウォッチリストの最大取得件数
 */
export const WATCHLIST_MAX_LIMIT = 50;

/**
 * ウォッチリスト取得SELECTカラム
 */
export const WATCHLIST_SELECT =
  'id, tmdb_movie_id, title, poster_path, release_date, added_at, watched_at';

const TARGET = 'ウォッチリスト';

/**
 * ウォッチリストエラーメッセージ
 */
export const WATCHLIST_ERROR_MESSAGES = {
  FETCH_FAILED: errorMessage.fetchFailed(TARGET),
  ADD_FAILED: errorMessage.addFailed(TARGET),
  REMOVE_FAILED: errorMessage.removeFailed(TARGET),
  WATCHED_UPDATE_FAILED: '視聴済みの更新に失敗しました',
  ALREADY_EXISTS: 'この映画はすでにウォッチリストに追加されています',
  NOT_FOUND: 'ウォッチリストに見つかりません',
  INVALID_ID: errorMessage.invalid('ウォッチリストID'),
  INVALID_QUERY: errorMessage.invalid('クエリパラメータ'),
  INVALID_BODY: errorMessage.invalid('入力内容'),
} as const;

/**
 * ウォッチリスト成功メッセージ
 */
export const WATCHLIST_SUCCESS_MESSAGES = {
  ADDED: successMessage.added(TARGET),
  REMOVED: successMessage.removed(TARGET),
  MARKED_WATCHED: '視聴済みにしました',
  UNMARKED_WATCHED: '未視聴に戻しました',
} as const;

/**
 * 視聴済みの表示ラベル
 */
export const WATCHLIST_WATCHED_LABELS = {
  /** 視聴済みにする */
  MARK: '視聴済みにする',
  /** 未視聴に戻す */
  UNMARK: '未視聴に戻す',
  /** 視聴済みバッジ */
  BADGE: '視聴済み',
} as const;
