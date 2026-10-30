/**
 * アプリケーション共通定数
 */

/**
 * メインコンテンツ領域のid
 * スキップリンク（本文へ移動）の移動先として使う
 */
export const MAIN_CONTENT_ID = 'main-content';

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
  /** 一覧画面のフィルター条件 */
  MOVIE_FILTERS: 'movie-app:movie-filters',
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
  /** 管理者向けのアカウント管理（admin ロールのみ） */
  ADMIN_ACCOUNTS: '/admin/accounts',
  /** 受賞作品 */
  AWARDS: '/awards',
  /** シアター体験 */
  THEATER_EXPERIENCE: '/theater-experience',
  /** 二段階認証コードの入力（第2要素が未了のときだけ到達する） */
  TOTP_CHALLENGE: '/auth/two-factor',
  /** パスワードを忘れた場合のメール入力 */
  FORGOT_PASSWORD: '/auth/forgot-password',
  /** パスワード再設定（メールのリンクから到達する） */
  RESET_PASSWORD: '/auth/reset-password',
  /** 認証エラー */
  AUTH_ERROR: '/auth/error',
  /** 映画詳細 */
  MOVIE_DETAIL: (id: string | number) => `/movies/${id}`,
  /** 人物詳細（公開ページ。AUTH_REQUIRED_ROUTES には含めない） */
  PERSON_DETAIL: (id: string | number) => `/person/${id}`,
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
 * admin ロールが必要なルート（proxy の判定に使う）
 *
 * ⚠️ ここでの保護は入口の体裁に過ぎない。`/api/*` は proxy の判定を素通りする
 * ため、**ロールの最終判定は各 API Route の `withAdminAuth` で行う**。
 * 画面だけ塞いでも、APIを直接叩かれれば意味がない。
 */
export const ADMIN_REQUIRED_ROUTES = [ROUTES.ADMIN_ACCOUNTS] as const;

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
  PASSWORD_MIN_LENGTH: 12,
  /**
   * パスワード最大バイト数（UTF-8）
   *
   * bcrypt は入力を72バイトで黙って切り詰める。上限を設けないと、長い
   * パスワードを設定した利用者が「先頭72バイトさえ一致すれば通る」ことに
   * 気づけない（#652）。文字数ではなくバイト数で判定するのは、日本語が
   * UTF-8 で1文字3バイトになり文字数と乖離するため。
   */
  PASSWORD_MAX_BYTES: 72,
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
