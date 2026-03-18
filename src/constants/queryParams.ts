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
