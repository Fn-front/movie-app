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
 * お気に入り照会SELECTカラム
 *
 * 「この映画は登録済みか・何点か」の判定にしか使わないため、
 * タイトルやポスターは載せない。全件返しても軽量に保つための絞り込み。
 */
export const FAVORITES_LOOKUP_SELECT = 'id, tmdb_movie_id, rating';

/**
 * お気に入り照会の1回あたり取得件数
 *
 * PostgREST の max_rows（supabase/config.toml は 1000）以下にする。
 * 超える値を指定しても黙って打ち切られ、続きがあるのか判別できなくなる
 */
export const FAVORITES_LOOKUP_PAGE_SIZE = 1000;

/**
 * お気に入り照会で読むページ数の上限
 *
 * 10ページ = 10,000件。暴走を止めるための保険で、現実的な利用では到達しない
 */
export const FAVORITES_LOOKUP_MAX_PAGES = 10;

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

/**
 * お気に入り一覧でキャッシュに保持する最大ページ数
 *
 * `useInfiniteQuery` の `maxPages`。これを超えると、進んだ方向と反対側の
 * ページがキャッシュから捨てられる。
 *
 * ## なぜ要るか
 *
 * 無制限（既定）だと、invalidate のたびに**読み込み済みの全ページを順に
 * 取り直す**。お気に入りは実質 append-only（実測で削除率 1.5%。ウォッチリストは
 * 32.1%）で増え続けるため、年単位で見ると操作1回あたりのリクエストが
 * 無視できなくなる（#972）。
 *
 * 実測の増加ペース（0.53件/日）だと、3年後に約711件＝36ページ。
 * 評価の更新1回ごとに36リクエストが飛ぶ計算になる。
 *
 * ## なぜ5か
 *
 * 1ページ20件なので100件ぶん。画面に収まる量（グリッドで概ね4〜5行）に対して
 * 十分な前後の余白がある一方、invalidate の再取得は最大5本で頭打ちになる。
 *
 * 小さくすると上下スクロールのたびに取り直しが増え、大きくすると
 * invalidate のコストが戻る。
 *
 * ⚠️ `maxPages` は双方向リストでしか使えない。`getPreviousPageParam` と
 * 上方向のロード導線（`favoritesPage` の先頭センチネル）が前提。
 * 片方でも欠けると、捨てられたページを取り直せず**表示中の項目が消える**。
 */
export const FAVORITES_MAX_CACHED_PAGES = 5;
