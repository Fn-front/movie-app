/**
 * アプリケーション定数
 */

/**
 * API関連の定数
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
  /** リソース競合（重複登録等） */
  CONFLICT: 409,
  /** レート制限超過 */
  TOO_MANY_REQUESTS: 429,
  /** サーバー内部エラー */
  INTERNAL_SERVER_ERROR: 500,
} as const;

/**
 * ローカルストレージキー
 */
export const STORAGE_KEYS = {
  /** ユーザーテーマ設定 */
  THEME: 'movie-app:theme',
  /** ユーザー言語設定 */
  LANGUAGE: 'movie-app:language',
  /** 最近検索したキーワード */
  RECENT_SEARCHES: 'movie-app:recent-searches',
} as const;

/**
 * アプリケーションルート
 */
export const ROUTES = {
  /** ホーム */
  HOME: '/',
  /** ログイン */
  LOGIN: '/auth/signin',
  /** 新規登録 */
  REGISTER: '/auth/signup',
  /** アカウント設定 */
  SETTINGS: '/settings',
  /** 映画詳細 */
  MOVIE_DETAIL: (id: string | number) => `/movies/${id}`,
} as const;

/**
 * エラーメッセージ
 */
export const ERROR_MESSAGES = {
  /** ネットワークエラー */
  NETWORK_ERROR: 'ネットワークエラーが発生しました。接続を確認してください。',
  /** 認証エラー */
  AUTH_ERROR: '認証に失敗しました。再度ログインしてください。',
  /** 不明なエラー */
  UNKNOWN_ERROR: '予期しないエラーが発生しました。',
  /** データ取得エラー */
  FETCH_ERROR: 'データの取得に失敗しました。',
} as const;

/**
 * バリデーション設定
 */
export const VALIDATION = {
  /** パスワード最小文字数 */
  PASSWORD_MIN_LENGTH: 8,
  /** メールアドレス最大文字数 */
  EMAIL_MAX_LENGTH: 255,
  /** 検索キーワード最大文字数 */
  SEARCH_MAX_LENGTH: 100,
  /** コメント最大文字数 */
  COMMENT_MAX_LENGTH: 500,
} as const;

/**
 * デバウンス時間（ミリ秒）
 */
export const DEBOUNCE_TIME = {
  /** 検索入力 */
  SEARCH: 500,
  /** リサイズイベント */
  RESIZE: 300,
  /** スクロールイベント */
  SCROLL: 200,
} as const;

/**
 * ページネーション設定
 */
export const PAGINATION = {
  /** デフォルトページ */
  DEFAULT_PAGE: 1,
  /** 1ページあたりのアイテム数 */
  ITEMS_PER_PAGE: 20,
  /** 最大ページ数 */
  MAX_PAGE: 500,
} as const;

/**
 * ブレークポイント（ピクセル）
 */
export const BREAKPOINTS = {
  /** スマホ */
  SM: 640,
  /** タブレット */
  MD: 768,
  /** ラップトップ */
  LG: 1024,
  /** デスクトップ */
  XL: 1280,
  /** 大型デスクトップ */
  XXL: 1536,
} as const;

/**
 * アニメーション設定
 */
export const ANIMATION = {
  /** トースト表示時間（ミリ秒） */
  TOAST_DURATION: 5000,
  /** モーダルフェード時間（ミリ秒） */
  MODAL_FADE_DURATION: 300,
  /** ページ遷移時間（ミリ秒） */
  PAGE_TRANSITION_DURATION: 200,
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
