/**
 * 興味なし映画関連の定数
 */

import { errorMessage, successMessage } from './common';

/**
 * 興味なし映画取得SELECTカラム
 */
export const DISMISSED_MOVIES_SELECT =
  'id, tmdb_movie_id, title, poster_path, genre_ids, created_at';

/**
 * 興味なし照会の1ページあたりの件数
 *
 * PostgREST の `max_rows`（1000 / `supabase/config.toml`）と同じ値。
 * これを超えると黙って打ち切られる（#1274）
 */
export const DISMISSED_MOVIES_PAGE_SIZE = 1000;

/**
 * 興味なし照会で読むページ数の上限
 *
 * 10ページ = 10,000件。暴走を止めるための保険で、現実的な利用では到達しない
 */
export const DISMISSED_MOVIES_MAX_PAGES = 10;

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
