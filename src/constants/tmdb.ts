/**
 * TMDb API クライアント設定
 */

/**
 * TMDb API リトライ設定
 */
export const TMDB_RETRY_CONFIG = {
  /** リトライ最大回数 */
  MAX_RETRY_COUNT: 3,
  /** リトライ待機時間（ミリ秒） */
  RETRY_DELAY_MS: 1000,
  /** リトライ対象のHTTPステータスコード */
  RETRYABLE_STATUS_CODES: [429, 503, 504] as readonly number[],
} as const;

/** TMDb日本語訳の誤訳を自然な日本語に上書きするマップ */
export const GENRE_NAME_OVERRIDES: Record<string, string> = {
  履歴: '歴史',
  謎: 'ミステリー',
  西洋: '西部劇',
};

/** TMDbジャンルID → ジャンル名マッピング */
export const TMDB_GENRE_MAP: Record<number, string> = {
  28: 'アクション',
  12: 'アドベンチャー',
  16: 'アニメーション',
  35: 'コメディ',
  80: '犯罪',
  99: 'ドキュメンタリー',
  18: 'ドラマ',
  10751: 'ファミリー',
  14: 'ファンタジー',
  36: '歴史',
  27: 'ホラー',
  10402: '音楽',
  9648: 'ミステリー',
  10749: 'ロマンス',
  878: 'SF',
  10770: 'テレビ映画',
  53: 'スリラー',
  10752: '戦争',
  37: '西部劇',
};

/**
 * TMDb Discover APIのsort_byパラメータ値
 */
export const TMDB_SORT_BY = { POPULARITY_DESC: 'popularity.desc' } as const;

/**
 * 映画詳細取得時に付与する append_to_response の値。
 * credits（キャスト・スタッフ）、watch/providers（配信情報）、videos（予告動画）を一度に取得。
 */
export const TMDB_MOVIE_DETAIL_APPEND = 'credits,watch/providers,videos';
