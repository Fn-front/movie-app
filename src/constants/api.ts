/**
 * API関連定数
 */

/**
 * TMDb API設定
 */
export const API = {
  /** TMDb API Base URL */
  TMDB_BASE_URL: 'https://api.themoviedb.org/3',
  /** TMDb 画像 Base URL */
  TMDB_IMAGE_BASE_URL: 'https://image.tmdb.org/t/p',
  /** TMDb API言語設定（ISO 639-1 + ISO 3166-1） */
  TMDB_LANGUAGE: 'ja-JP',
  /** TMDb APIリージョン設定（ISO 3166-1） */
  TMDB_REGION: 'JP',
  /** APIリクエストタイムアウト（ミリ秒） */
  TIMEOUT: 30000,
  /** 1ページあたりの映画表示件数 */
  MOVIES_PER_PAGE: 20,
} as const;

/**
 * HTTPステータスコード
 */
export const HTTP_STATUS = {
  /** 成功 */
  OK: 200,
  /** 成功（リソース作成） */
  CREATED: 201,
  /** クライアントエラー（バリデーション等） */
  BAD_REQUEST: 400,
  /** 認証エラー */
  UNAUTHORIZED: 401,
  /** リソース未検出 */
  NOT_FOUND: 404,
  /** リソース競合（重複登録等） */
  CONFLICT: 409,
  /** レート制限超過 */
  TOO_MANY_REQUESTS: 429,
  /** サーバー内部エラー */
  INTERNAL_SERVER_ERROR: 500,
} as const;

/**
 * APIエラーコード
 */
export const ERROR_CODE = {
  /** サーバー内部エラー */
  SERVER_ERROR: 'SERVER_ERROR',
  /** 認証エラー */
  UNAUTHORIZED: 'UNAUTHORIZED',
  /** バリデーションエラー */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** クライアントエラー */
  BAD_REQUEST: 'BAD_REQUEST',
  /** リソース未検出 */
  NOT_FOUND: 'NOT_FOUND',
  /** レート制限超過 */
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  /** リソース競合 */
  CONFLICT: 'CONFLICT',
} as const;

/**
 * Supabaseエラーコード
 */
export const SUPABASE_ERROR_CODE = {
  /** レコードが見つからない（.single()で0件） */
  NOT_FOUND: 'PGRST116',
} as const;

/**
 * 共通APIエラーメッセージ
 */
export const API_ERROR_MESSAGES = {
  /** バリデーションエラー */
  VALIDATION_ERROR: 'バリデーションエラー',
  /** サーバーエラー */
  SERVER_ERROR: 'サーバーエラーが発生しました',
} as const;

/**
 * TMDb APIエンドポイント
 */
export const TMDB_ENDPOINTS = {
  /** 人気映画 */
  POPULAR: '/movie/popular',
  /** 公開予定映画 */
  UPCOMING: '/movie/upcoming',
  /** 上映中映画 */
  NOW_PLAYING: '/movie/now_playing',
  /** 高評価映画 */
  TOP_RATED: '/movie/top_rated',
  /** 映画詳細 */
  MOVIE_DETAIL: (movieId: number | string) => `/movie/${movieId}`,
  /** 映画検索 */
  SEARCH: '/search/movie',
  /** ジャンル一覧 */
  GENRES: '/genre/movie/list',
  /** 映画ディスカバー */
  DISCOVER: '/discover/movie',
  /** 映画キーワード */
  MOVIE_KEYWORDS: (movieId: number | string) => `/movie/${movieId}/keywords`,
  /** トレンド映画（週次） */
  TRENDING: '/trending/movie/week',
  /** 映画リリース日（国別リリースタイプ取得用） */
  MOVIE_RELEASE_DATES: (movieId: number | string) =>
    `/movie/${movieId}/release_dates`,
} as const;

/**
 * TMDb画像サイズ
 */
export const TMDB_IMAGE_SIZES = {
  /** ポスター画像サイズ */
  POSTER: {
    SMALL: 'w92',
    MEDIUM: 'w185',
    LARGE: 'w500',
    XLARGE: 'w780',
    ORIGINAL: 'original',
  },
  /** バックドロップ画像サイズ */
  BACKDROP: {
    SMALL: 'w300',
    MEDIUM: 'w780',
    LARGE: 'w1280',
    ORIGINAL: 'original',
  },
} as const;
