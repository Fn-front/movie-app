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
  /**
   * 映画一覧のリスト表示トグル
   *
   * 状態は `aria-pressed` だけで伝えるので、ラベルは状態で変えない。
   * 「○○に切り替え」と `aria-pressed` を併用すると、リスト表示中に
   * 「グリッド表示に切り替え、オン」と読まれて意味が反転する
   * （ARIA APG のボタンパターン）
   */
  LIST_VIEW: 'リスト表示',
  /** メニューを開く */
  OPEN_MENU: 'メニューを開く',
  /** メニューを閉じる */
  CLOSE_MENU: 'メニューを閉じる',
  /** モバイルメニュー */
  MOBILE_MENU: 'モバイルメニュー',
  /** モバイルナビゲーション */
  MOBILE_NAV: 'モバイルナビゲーション',
  /**
   * SP のボトムナビゲーション（#1028）
   *
   * サイドナビの「映画ナビゲーション」・ドロワーの「モバイルナビゲーション」と
   * 文言が重複しないようにする。同一ページ内に複数の nav があるため、
   * 名前が被ると支援技術のランドマーク一覧で区別できない
   */
  PRIMARY_NAV: '主要ナビゲーション',
  /** 公開カレンダーを開く */
  OPEN_CALENDAR: '公開カレンダーを開く',
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
  /**
   * 作品を共有（動的）
   *
   * 同じ画面に共有ボタンが1つしか無くても、作品名を含める。スクリーン
   * リーダーのボタン一覧では周囲の文脈が落ちるため（#1046 と同じ方針）。
   * 状態は持たないボタンなので aria-label だけで伝える
   */
  SHARE_MOVIE: (title: string) => `${title}を共有`,
  /** 映画詳細のスクロール領域（あらすじ・詳細情報・キャスト） */
  MOVIE_DETAIL_INFO: '作品情報',
  /** Cookie同意バナー（ランドマーク化してキーボードから到達できるようにする） */
  COOKIE_BANNER: 'Cookieの利用について',
  /** フッターのナビゲーション（同一ページ内に複数の nav があるため名前が要る） */
  FOOTER_NAV: 'フッターナビゲーション',
} as const;

/**
 * 空状態メッセージ
 */
export const EMPTY_MESSAGES = {
  /** ウォッチリスト */
  WATCHLIST: 'ウォッチリストに映画を追加しましょう',
  /** お気に入り */
  FAVORITES: 'お気に入りの映画を追加しましょう',
  /** カレンダー（選択日に公開予定なし） */
  CALENDAR: 'この日に公開予定の映画はありません',
  /** カレンダー（表示中の月に公開予定なし） */
  CALENDAR_MONTH: 'この月に公開予定の映画はありません',
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
  /**
   * 公開日で選べる範囲の説明（タブごとに変わる）
   *
   * グレーアウトだけでは「なぜこの日付が選べないのか」が伝わらない
   * （WCAG 3.3.2 Labels or Instructions）。`aria-describedby` で
   * 日付入力に紐づける（#994）
   */
  DATE_RANGE_HINT: {
    /** 劇場 × 公開予定 */
    THEATRICAL_UPCOMING: 'このタブは今日以降に公開される作品のみです。',
    /** 劇場 × 公開中 */
    THEATRICAL_NOW_SHOWING: 'このタブは公開中の作品のみです。',
    /** 配信 × 配信中 */
    STREAMING_NOW_SHOWING: 'このタブは直近2ヶ月に公開された配信中の作品です。',
  },
  /**
   * 過去作品の探し方（#996）
   *
   * 範囲を絞ると「選べない」ことは伝わるが「ではどこで探せるのか」は
   * 伝わらない。`/movies/*` の一覧は取り込み窓が未来寄りに固定されていて
   * 過去作品の母集団を持たないが、`/search` は公開年だけで検索できる。
   * 機能は揃っていて導線だけが無かった
   */
  PAST_MOVIES_GUIDE: '過去の作品は検索から公開年で探せます。',
  /** 過去作品の検索へのリンク文言 */
  PAST_MOVIES_LINK: '公開年で検索する',
  /** 公開日の範囲外を指定したときのエラー */
  DATE_OUT_OF_RANGE: '選べる期間の外の日付が入力されています。',
  /** 開始日が終了日より後のときのエラー */
  DATE_RANGE_REVERSED: '終了日は開始日以降の日付を指定してください。',
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
  /** 配信サービス */
  WATCH_PROVIDER: '配信サービス',
  /** 提供形態フィルタ（legend） */
  OFFER_TYPE_FILTER: '提供形態フィルタ',
  /** 見放題のみ */
  OFFER_TYPE_FLATRATE: '見放題のみ',
  /** レンタル・購入のみ */
  OFFER_TYPE_PAID: 'レンタル・購入のみ',
  /** 地域 */
  REGION: '地域',
  /** 地域フィルタ（legend） */
  REGION_FILTER: '地域フィルタ',
  /** 韓国 */
  REGION_KOREA: '韓国',
  /** 中華圏 */
  REGION_CHINESE: '中華圏',
  /** タイ・インド */
  REGION_THAI_INDIAN: 'タイ・インド',
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
