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
  /**
   * 公開期間の開始日（YYYY-MM-DD）
   *
   * ⚠️ YEAR とは意味が違う（#997）。YEAR は TMDb の代表公開日の年で絞るが、
   * こちらは「いずれかの国のリリースが範囲に入るか」で絞る。混ぜると
   * 説明できない結果になるため、APIは同時指定を 400 で弾く
   */
  RELEASE_DATE_GTE: 'release_date_gte',
  /** 公開期間の終了日（YYYY-MM-DD） */
  RELEASE_DATE_LTE: 'release_date_lte',
  /** 最低評価 */
  VOTE_AVERAGE_GTE: 'vote_average_gte',
} as const;

/**
 * 開いている映画詳細モーダルを表すURLクエリパラメータキー
 *
 * 一覧の URL に足すことで、モーダルが**リロードしても復元され、戻るで
 * 閉じられる**ようになる（#1033）。共有するのはモーダルの URL ではなく
 * `ROUTES.MOVIE_DETAIL`（全画面ページ）であることに注意。
 *
 * ⚠️ これは**フィルターではない**。`MOVIE_FILTER_QUERY_PARAMS` に足さないこと。
 * 足すと `useMovieList` の URL 追従がモーダルの開閉をフィルター変更と
 * 誤認し、条件の state を作り直してしまう（#1051 / #1059）。
 */
export const MOVIE_DETAIL_QUERY_PARAM = 'movie_id';

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
  /** 配信サービスのプロバイダーID（カンマ区切り） */
  WATCH_PROVIDERS: 'watch_providers',
  /** 配信の提供形態（カンマ区切り） */
  OFFER_TYPES: 'offer_types',
  /** 表示に含める地域グループ（カンマ区切り） */
  INCLUDE_REGIONS: 'include_regions',
} as const;
