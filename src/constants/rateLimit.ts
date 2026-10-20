/**
 * レート制限の定数
 *
 * 各ルートに散在していた action 種別・閾値を集約する。
 */

/**
 * DB-based レート制限のアクション種別（`rate_limits.action_type` の値）。
 *
 * ⚠️ これらは DB に保存されるキーのため、値を変更しないこと（変更すると既存の
 * レート制限レコードと不整合になる）。OTP 系（registration / login / password_change 等）は
 * `OTP_ACTION`（otp.ts）を参照。
 */
export const RATE_LIMIT_ACTION = {
  WRITE_FAVORITES: 'write_api_favorites',
  WRITE_WATCHLIST: 'write_api_watchlist',
  WRITE_DISMISSED_MOVIES: 'write_api_dismissed_movies',
  WRITE_PROFILE: 'write_api_profile',
  WRITE_SETTINGS: 'write_api_settings',
  READ_THEATERS: 'read_api_theaters',
  READ_THEATER_DETAIL: 'read_api_theater_detail',
  AWARDS_FETCH: 'awards_fetch',
  SUGGEST_TITLE: 'suggest_title',
  REGISTER: 'register',
  CHANGE_PASSWORD: 'change_password',
  RECOMMENDATION_REFRESH: 'recommendation_refresh',
  WRITE_RECOMMENDATION_EVENTS: 'write_api_recommendation_events',
  /** ログイン試行の送信元単位の上限（IPアドレス単位） */
  LOGIN_IP: 'login_ip',
  /** OTP の日次送信上限（メールアドレス単位） */
  OTP_SEND_DAILY: 'otp_send_daily',
  /** OTP 検証試行の上限（メールアドレス単位。OTP行の attempts とは独立した多層防御） */
  OTP_VERIFY: 'otp_verify',
  /** 二段階認証コードの検証試行の上限（ユーザー単位） */
  TOTP_VERIFY: 'totp_verify',
  /** パスワードリセットの発行上限（メールアドレス単位） */
  PASSWORD_RESET_REQUEST: 'password_reset_request',
  /** パスワードリセットの検証試行の上限（送信元単位） */
  PASSWORD_RESET_CONFIRM: 'password_reset_confirm',
  /** 映画一覧の取得（未認証は送信元単位 / 認証済みはユーザー単位） */
  READ_MOVIES: 'read_api_movies',
  /** 映画検索の実行（送信元単位） */
  SEARCH_MOVIES: 'search_api_movies',
  /** 映画詳細の取得（未認証は送信元単位 / 認証済みはユーザー単位） */
  READ_MOVIE_DETAIL: 'read_api_movie_detail',
  /** 人物詳細の取得（未認証は送信元単位 / 認証済みはユーザー単位） */
  READ_PERSON_DETAIL: 'read_api_person_detail',
  /** ジャンル一覧の取得（送信元単位） */
  READ_GENRES: 'read_api_genres',
  /** 保存済みフィルター条件の更新（ユーザー単位） */
  WRITE_FILTERS: 'write_api_filters',
  /**
   * 認証必須の読み取りAPI（ユーザー単位）。
   * user_id で絞ったDB読み取りのみで外部APIを呼ばないため、
   * フィルター取得・カレンダー・レコメンド残回数で1つのカウンタを共有する。
   */
  READ_USER_DATA: 'read_api_user_data',
} as const;

/**
 * `rate_limits.action_type` に入れてよい値。
 *
 * DB 側の `chk_action_type` CHECK 制約の許可リストと**必ず一致させること**。
 * 許可リストに無い値で INSERT すると 23514 で失敗し、その制限が無言で
 * 機能しなくなる（#546 / #659 で2度発生）。`checkRateLimit` / `checkCooldown` の
 * 引数をこの型で縛ることで、同じ事故をコンパイル時に防ぐ。
 */
export type RateLimitActionType =
  | (typeof RATE_LIMIT_ACTION)[keyof typeof RATE_LIMIT_ACTION]
  | 'registration'
  | 'login'
  | 'password_change';

/**
 * DB-based レート制限の閾値プリセット（maxAttempts 回 / windowMinutes 分）。
 * checkRateLimit(supabase, id, action, maxAttempts, windowMinutes) に渡す。
 *
 * consume_rate_limit は**スライディングウィンドウ**方式。直近 windowMinutes 以内の
 * 試行が maxAttempts 回に達すると同じ長さだけロックし、最後の試行から
 * windowMinutes 経過すればカウンタは 1 に戻る（#758）。
 * 間隔を空けた通常利用でロックに到達することはない。
 */
export const RATE_LIMIT_CONFIG = {
  /**
   * 一覧から次々に登録する操作が想定されるため、他の書き込みAPIより厚く取る。
   *
   * 追加・編集・削除はリソース単位で同じカウンタを共有する（HTTPメソッド単位では
   * ない）。「6件追加して5件外す」も11回として数えられるため、UI操作1件=1回で
   * 数えて余裕のある値にしている。1分30回は約2秒に1回ペースで、人間の連続操作は
   * 通るがスクリプトによる乱用は止まる。
   */
  WRITE_FAVORITES: { maxAttempts: 30, windowMinutes: 1 },
  WRITE_WATCHLIST: { maxAttempts: 30, windowMinutes: 1 },
  WRITE_DISMISSED_MOVIES: { maxAttempts: 30, windowMinutes: 1 },
  /** 単発の設定変更で連続操作が無いため、一括登録系より絞る */
  WRITE_PROFILE: { maxAttempts: 10, windowMinutes: 1 },
  WRITE_SETTINGS: { maxAttempts: 10, windowMinutes: 1 },
  READ_THEATERS: { maxAttempts: 30, windowMinutes: 1 },
  READ_THEATER_DETAIL: { maxAttempts: 30, windowMinutes: 1 },
  AWARDS_FETCH: { maxAttempts: 30, windowMinutes: 10 },
  SUGGEST_TITLE: { maxAttempts: 10, windowMinutes: 60 },
  /**
   * レコメンド利用イベントの記録。
   *
   * クライアントは発生したイベントを短い待ち時間でまとめ、1リクエストで
   * 最大 RECOMMENDATION_EVENTS_MAX_PER_REQUEST 件を送る（#757）。
   * 1ページ表示あたり表示イベントが1本、以降はクリック等の操作ごとに
   * 数本という頻度なので、30回/分で通常利用には十分な余裕がある。
   *
   * ⚠️ 1件ずつ送る実装に戻すと、レコメンド最大10件 × リロードで即座に
   * 上限へ到達する。送信をバッチ化したままにすること。
   */
  WRITE_RECOMMENDATION_EVENTS: { maxAttempts: 30, windowMinutes: 1 },
  REGISTER: { maxAttempts: 5, windowMinutes: 60 },
  /**
   * ログイン試行の送信元単位の上限。
   *
   * アカウント単位（LOGIN_ACCOUNT）より緩くし、1つの送信元からの大量試行だけを
   * 止める。厳しくしすぎると、NAT や社内プロキシで同一IPを共有する正当な
   * 利用者をまとめて巻き込む。
   */
  LOGIN_IP: { maxAttempts: 20, windowMinutes: 15 },
  /**
   * 公開映画APIの上限。
   *
   * 一覧は infinite query でスクロールごとに1本、検索は500msのデバウンスで
   * 打鍵ごとに発火するため、読み取り系は厚く取る。
   *
   * 0.5req/秒 相当（300回/10分）でも、TMDb が許す約50req/秒に対して
   * 100分の1以下に抑えられるため、濫用対策としては機能する。
   *
   * ルートごとに別のカウンタにしている。1つにまとめると、一覧のスクロールで
   * 枠を使い切った利用者が詳細ページでも 429 になる。
   */
  READ_MOVIES: { maxAttempts: 300, windowMinutes: 10 },
  SEARCH_MOVIES: { maxAttempts: 120, windowMinutes: 10 },
  READ_MOVIE_DETAIL: { maxAttempts: 300, windowMinutes: 10 },
  /**
   * 人物詳細も TMDb を叩く公開APIのため、映画詳細と同じ枠を別カウンタで持つ。
   * 共有にすると、映画詳細を見ていた利用者が人物ページで 429 になる。
   */
  READ_PERSON_DETAIL: { maxAttempts: 300, windowMinutes: 10 },
  READ_GENRES: { maxAttempts: 120, windowMinutes: 10 },
  /** 単発の保存操作のため WRITE_PROFILE / WRITE_SETTINGS と揃える */
  WRITE_FILTERS: { maxAttempts: 10, windowMinutes: 1 },
  /**
   * 認証必須の読み取り。カレンダーの月送りが最も回数を使うため厚めに取る。
   * 自分のデータしか読めず外部APIも呼ばないので、濫用の実害は小さい。
   */
  READ_USER_DATA: { maxAttempts: 300, windowMinutes: 10 },
  /**
   * ログイン試行のアカウント×送信元単位の上限。
   *
   * 識別子に送信元を含めるため、第三者が誤ったパスワードを試しても
   * **その第三者自身がロックされるだけ**で、正当な利用者は締め出されない（#644）。
   */
  LOGIN_ACCOUNT: { maxAttempts: 5, windowMinutes: 30 },
  /**
   * 二段階認証コードの検証試行の上限。
   *
   * 6桁 = 100万通りを前後1ステップの窓で受けるため、総当たりの成功確率は
   * 1試行あたり 3/10^6。上限5回なら窓が開いている間の成功確率は約 1.5/10^5 に
   * 収まる。ここを緩めると二段階認証が総当たりで抜かれる。
   *
   * 識別子はユーザーIDを使う（パスワード照合を通らないとここまで来ないため、
   * 第三者が他人のアカウントをロックすることはできない）。
   */
  TOTP_VERIFY: { maxAttempts: 5, windowMinutes: 15 },
} as const;

/**
 * checkRateLimit のデフォルト閾値（呼び出しで maxAttempts/windowMinutes を
 * 省略した場合に適用。change-password はこのデフォルトを利用）。
 */
export const RATE_LIMIT_DEFAULT = {
  MAX_ATTEMPTS: 3,
  WINDOW_MINUTES: 30,
} as const;

/**
 * インメモリ・レート制限（DB を使わない軽量制限）の設定。
 * CSP レポート受信など高頻度・低コストで判定したいエンドポイント向け。
 */
export const IN_MEMORY_RATE_LIMIT = {
  CSP_REPORT: { maxRequests: 60, windowMs: 60 * 1000 },
} as const;
