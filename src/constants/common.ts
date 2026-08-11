/**
 * アプリケーション共通定数
 */

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
  /** 公開予定 */
  UPCOMING: '/movies/upcoming',
  /** 公開中 */
  NOW_SHOWING: '/movies/now-showing',
  /** お気に入り */
  FAVORITES: '/favorites',
  /** ウォッチリスト */
  WATCHLIST: '/watchlist',
  /** 受賞作品 */
  AWARDS: '/awards',
  /** シアター体験 */
  THEATER_EXPERIENCE: '/theater-experience',
  /** 認証エラー */
  AUTH_ERROR: '/auth/error',
  /** 映画詳細 */
  MOVIE_DETAIL: (id: string | number) => `/movies/${id}`,
} as const;

/**
 * 認証が必要なルート（proxy と ナビゲーションの共通定義）
 * 未認証アクセス時は proxy がリダイレクトし、ナビからはログイン誘導を表示する。
 */
export const AUTH_REQUIRED_ROUTES = [
  ROUTES.WATCHLIST,
  ROUTES.SETTINGS,
  ROUTES.FAVORITES,
  ROUTES.THEATER_EXPERIENCE,
] as const;

/**
 * エラーメッセージ生成ヘルパー
 */
export const errorMessage = {
  /** 取得失敗: 「{対象}の取得に失敗しました」 */
  fetchFailed: (target: string) => `${target}の取得に失敗しました`,
  /** 保存失敗: 「{対象}の保存に失敗しました」 */
  saveFailed: (target: string) => `${target}の保存に失敗しました`,
  /** 追加失敗: 「{対象}への追加に失敗しました」 */
  addFailed: (target: string) => `${target}への追加に失敗しました`,
  /** 削除失敗: 「{対象}からの削除に失敗しました」 */
  removeFailed: (target: string) => `${target}からの削除に失敗しました`,
  /** 更新失敗: 「{対象}の更新に失敗しました」 */
  updateFailed: (target: string) => `${target}の更新に失敗しました`,
  /** バリデーションエラー: 「{対象}が不正です」 */
  invalid: (target: string) => `${target}が不正です`,
  /** 未検出: 「{対象}が見つかりません」 */
  notFound: (target: string) => `${target}が見つかりません`,
} as const;

/**
 * 成功メッセージ生成ヘルパー
 */
export const successMessage = {
  /** 追加成功: 「{対象}に追加しました」 */
  added: (target: string) => `${target}に追加しました`,
  /** 削除成功: 「{対象}から削除しました」 */
  removed: (target: string) => `${target}から削除しました`,
  /** 更新成功: 「{対象}を更新しました」 */
  updated: (target: string) => `${target}を更新しました`,
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
