/**
 * URLクエリパラメータキー定数
 */

export const QUERY_PARAMS = {
  /** ページ番号 */
  PAGE: 'page',
  /** ジャンル */
  GENRE: 'genre',
  /** 公開年 */
  YEAR: 'year',
  /** 最低評価 */
  VOTE_AVERAGE_GTE: 'vote_average_gte',
} as const;

/**
 * 一覧画面（/ , /movies/upcoming, /movies/now-showing）の
 * フィルター状態を保持するURLクエリパラメータキー
 */
export const MOVIE_FILTER_QUERY_PARAMS = {
  /** 並び順 */
  SORT_BY: 'sort_by',
  /** 公開種別 */
  RELEASE_TYPE: 'release_type',
  /** ジャンルID（カンマ区切り） */
  GENRE_IDS: 'genre_ids',
  /** 公開日の開始日（YYYY-MM-DD） */
  DATE_RANGE_GTE: 'date_range_gte',
  /** 公開日の終了日（YYYY-MM-DD） */
  DATE_RANGE_LTE: 'date_range_lte',
  /** リバイバル上映フィルタ */
  IS_REVIVAL: 'is_revival',
} as const;
