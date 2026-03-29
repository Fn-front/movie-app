/**
 * UI文言定数
 */

/**
 * 共通aria-label
 */
export const ARIA_LABELS = {
  /** 閉じる */
  CLOSE: '閉じる',
  /** 削除 */
  DELETE: '削除',
  /** 検索を開く */
  OPEN_SEARCH: '検索を開く',
  /** 検索を閉じる */
  CLOSE_SEARCH: '検索を閉じる',
  /** 検索 */
  SEARCH: '検索',
  /** 映画を検索 */
  SEARCH_MOVIES: '映画を検索',
  /** メニューを開く */
  OPEN_MENU: 'メニューを開く',
  /** メニューを閉じる */
  CLOSE_MENU: 'メニューを閉じる',
  /** モバイルメニュー */
  MOBILE_MENU: 'モバイルメニュー',
  /** モバイルナビゲーション */
  MOBILE_NAV: 'モバイルナビゲーション',
  /** ページネーション */
  PAGINATION: 'ページネーション',
  /** 最初のページへ */
  FIRST_PAGE: '最初のページへ',
  /** 前のページへ */
  PREV_PAGE: '前のページへ',
  /** 次のページへ */
  NEXT_PAGE: '次のページへ',
  /** 最後のページへ */
  LAST_PAGE: '最後のページへ',
  /** ページ番号（動的） */
  PAGE: (page: number) => `ページ ${page}`,
  /** 確認コード */
  OTP_CODE: '確認コード',
  /** 確認コードを検証 */
  VERIFY_OTP: '確認コードを検証',
  /** 確認コードを再送信 */
  RESEND_OTP: '確認コードを再送信',
  /** 予告動画を再生 */
  PLAY_TRAILER: '予告動画を再生',
} as const;

/**
 * 空状態メッセージ
 */
export const EMPTY_MESSAGES = {
  /** ウォッチリスト */
  WATCHLIST: 'ウォッチリストに映画を追加しましょう',
  /** お気に入り */
  FAVORITES: 'お気に入りの映画を追加しましょう',
  /** カレンダー（公開予定なし） */
  CALENDAR: 'この日に公開予定の映画はありません',
  /** 興味なし */
  DISMISSED: '興味なしに登録した映画はありません',
} as const;

/**
 * モーダルタイトル
 */
export const MODAL_TITLES = {
  /** 映画詳細 */
  MOVIE_DETAIL: '映画詳細',
  /** フィルター */
  FILTER: 'フィルター',
  /** お気に入りを編集 */
  FAVORITE_EDIT: 'お気に入りを編集',
  /** お気に入りに追加 */
  FAVORITE_ADD: 'お気に入りに追加',
  /** メニュー */
  MENU: 'メニュー',
} as const;

/**
 * ボタンラベル
 */
export const BUTTON_LABELS = {
  /** 削除 */
  DELETE: '削除',
  /** キャンセル */
  CANCEL: 'キャンセル',
  /** 更新 */
  UPDATE: '更新',
  /** 登録 */
  REGISTER: '登録',
  /** クリア */
  CLEAR: 'クリア',
  /** 適用 */
  APPLY: '適用',
  /** 確認 */
  CONFIRM: '確認',
  /** コードを再送信 */
  RESEND_CODE: 'コードを再送信',
} as const;

/**
 * フィルターラベル
 */
export const FILTER_LABELS = {
  /** 公開日 */
  RELEASE_DATE: '公開日',
  /** 開始日 */
  DATE_FROM: '開始日',
  /** 終了日 */
  DATE_TO: '終了日',
  /** リバイバル上映 */
  REVIVAL: 'リバイバル上映',
  /** リバイバル上映フィルタ（legend） */
  REVIVAL_FILTER: 'リバイバル上映フィルタ',
  /** すべて */
  ALL: 'すべて',
  /** リバイバルのみ */
  REVIVAL_ONLY: 'リバイバルのみ',
  /** リバイバル除外 */
  REVIVAL_EXCLUDE: 'リバイバル除外',
  /** ジャンル */
  GENRE: 'ジャンル',
  /** 評価 */
  RATING: '評価',
} as const;

/**
 * OTP関連メッセージ
 */
export const OTP_MESSAGES = {
  /** 見出し */
  HEADING: '確認コードを入力',
  /** 再送信カウントダウン */
  RESEND_COUNTDOWN: (seconds: number) => `再送信まで ${seconds}秒`,
} as const;

/**
 * エラーメッセージ（UI固有）
 */
export const UI_ERROR_MESSAGES = {
  /** 映画情報取得失敗 */
  MOVIE_DETAIL_FETCH_FAILED: '映画情報の取得に失敗しました。',
  /** OTP検証失敗 */
  OTP_VERIFY_FAILED: '検証に失敗しました。',
  /** OTP再送信失敗 */
  OTP_RESEND_FAILED: '再送信に失敗しました。',
  /** ネットワークエラー */
  NETWORK_ERROR: 'ネットワークエラーが発生しました。',
} as const;
