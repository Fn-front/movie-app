/**
 * 内部APIエンドポイント定数
 *
 * `src/lib/api` の client 群が使う `/api/...` パスの単一ソース。
 * 静的パスは定数、パラメータ付きの動的パスはビルダー関数で表現する。
 */

export const API_ENDPOINTS = {
  // --- 認証 ---
  /** OTP検証 */
  OTP_VERIFY: '/api/auth/otp/verify',
  /** OTP送信 */
  OTP_SEND: '/api/auth/otp/send',
  /** 新規登録 */
  AUTH_REGISTER: '/api/auth/register',

  // --- ユーザー ---
  /** プロフィール更新 */
  USER_PROFILE: '/api/user/profile',
  /** 設定取得・更新 */
  USER_SETTINGS: '/api/user/settings',
  /** パスワード変更 */
  USER_CHANGE_PASSWORD: '/api/user/change-password',

  // --- お気に入り ---
  /** お気に入り一覧・追加 */
  FAVORITES: '/api/favorites',
  /** お気に入り個別（更新・削除） */
  favoriteById: (id: string) => `/api/favorites/${id}`,

  // --- ウォッチリスト ---
  /** ウォッチリスト一覧・追加 */
  WATCHLIST: '/api/watchlist',
  /** ウォッチリスト個別（削除） */
  watchlistById: (id: string) => `/api/watchlist/${id}`,
  /** ウォッチリストのカレンダー */
  WATCHLIST_CALENDAR: '/api/watchlist/calendar',

  // --- 興味なし ---
  /** 興味なし一覧・追加 */
  DISMISSED_MOVIES: '/api/dismissed-movies',
  /** 興味なし削除（tmdb_movie_id 指定） */
  dismissedMovieByTmdbId: (tmdbMovieId: number) =>
    `/api/dismissed-movies?tmdb_movie_id=${tmdbMovieId}`,

  // --- 映画 ---
  /** 映画一覧 */
  MOVIES: '/api/movies',
  /** 映画詳細 */
  movieById: (movieId: number) => `/api/movies/${movieId}`,
  /** 映画検索 */
  MOVIES_SEARCH: '/api/movies/search',
  /** ジャンル一覧 */
  MOVIES_GENRES: '/api/movies/genres',
  /** 原題提案 */
  MOVIES_SUGGEST_TITLE: '/api/movies/suggest-title',

  // --- 受賞・劇場・その他 ---
  /** 受賞作品 */
  AWARDS: '/api/awards',
  /** 劇場一覧 */
  THEATERS: '/api/theaters',
  /** 劇場詳細（slug 指定） */
  theaterBySlug: (slug: string) => `/api/theaters/${slug}`,
  /** 保存フィルタ取得・更新 */
  FILTERS: '/api/filters',
  /** レコメンド手動更新 */
  RECOMMENDATIONS_REFRESH: '/api/recommendations/refresh',
  /** レコメンド更新回数 */
  RECOMMENDATIONS_REFRESH_COUNT: '/api/recommendations/refresh-count',
} as const;
