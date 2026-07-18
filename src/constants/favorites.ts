/**
 * お気に入り関連の定数
 */

import { errorMessage, successMessage } from './common';

/**
 * お気に入りのデフォルト取得件数
 */
export const FAVORITES_DEFAULT_LIMIT = 20;

/**
 * お気に入りの最大取得件数
 */
export const FAVORITES_MAX_LIMIT = 50;

/**
 * お気に入り取得SELECTカラム
 */
export const FAVORITES_SELECT =
  'id, tmdb_movie_id, title, poster_path, release_date, rating, added_at';

/**
 * お気に入り評価の最小値
 */
export const FAVORITES_RATING_MIN = 1;

/**
 * お気に入り評価の最大値
 */
export const FAVORITES_RATING_MAX = 10;

/**
 * お気に入りソート対象
 */
export const FAVORITES_SORT_BY = {
  ADDED_AT: 'added_at',
  RATING: 'rating',
} as const;

/**
 * お気に入りソート順
 */
export const FAVORITES_SORT_ORDER = {
  ASC: 'asc',
  DESC: 'desc',
} as const;

const TARGET = 'お気に入り';

/**
 * お気に入りエラーメッセージ
 */
export const FAVORITES_ERROR_MESSAGES = {
  FETCH_FAILED: errorMessage.fetchFailed(TARGET),
  ADD_FAILED: errorMessage.addFailed(TARGET),
  REMOVE_FAILED: errorMessage.removeFailed(TARGET),
  UPDATE_FAILED: errorMessage.updateFailed('評価'),
  ALREADY_EXISTS: 'この映画は既にお気に入りに登録されています',
  NOT_FOUND: 'お気に入りが見つかりません',
  INVALID_ID: errorMessage.invalid('お気に入りID'),
  INVALID_QUERY: errorMessage.invalid('クエリパラメータ'),
  INVALID_BODY: errorMessage.invalid('入力内容'),
  INVALID_RATING: '評価は1〜10の整数で入力してください',
} as const;

/**
 * お気に入り成功メッセージ
 */
export const FAVORITES_SUCCESS_MESSAGES = {
  ADDED: successMessage.added(TARGET),
  REMOVED: successMessage.removed(TARGET),
  UPDATED: successMessage.updated('評価'),
} as const;
