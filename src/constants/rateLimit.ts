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
  /** ログイン時の二段階認証コードの検証試行の上限（ユーザー単位） */
  TOTP_VERIFY: 'totp_verify',
  /**
   * 設定画面での二段階認証操作の上限（ユーザー単位）
   *
   * ログインの `TOTP_VERIFY` とは**別のカウンタ**にする。同じにすると、
   * 設定画面での誤操作（コード欄が空のまま送信など）でログインの第2要素まで
   * ロックされ、利用者が自力で解除できない（#940）。
   */
  TOTP_SETTINGS_VERIFY: 'totp_settings_verify',
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
  /**
   * admin ルートのロール確認（セッション単位）
   *
   * `withAdminAuth` がロールをDBから読む前に消費する。これが無いと、
   * ログイン済みの非 admin が admin ルートを連打するだけで
   * `users` への SELECT が無制限に走る（#965）。
   */
  ADMIN_ROLE_CHECK: 'admin_role_check',
  /** admin によるアカウント発行・再発行（admin 単位） */
  ADMIN_ACCOUNT_ISSUE: 'admin_account_issue',
  /** admin による受賞作品の手動同期の実行（admin 単位） */
  ADMIN_AWARD_SYNC: 'admin_award_sync',
  /** 手動同期ジョブの進捗ポーリング（admin 単位） */
  ADMIN_AWARD_SYNC_STATUS: 'admin_award_sync_status',
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
 * 判定できなかったときに「拒否」側へ倒すアクション。
 *
 * `checkRateLimit` / `checkCooldown` は既定では判定不能時に通す（fail-open）。
 * DB が応答しないときにアプリ全体を止めないための選択だが、**認証系では
 * この理屈が成り立たない**。レート制限の判定直後には必ず DB 参照が続くため
 * （`src/lib/auth/auth.ts` のユーザー取得、`verifySecondFactor` の
 * `user_totp` 読み取り等）、DB が落ちていればどのみちそこで失敗する。
 * つまり認証系だけ拒否側に倒しても可用性は下がらない。
 *
 * 一方で素通しした場合の損失は大きい。特に二段階認証のコードは6桁＝約20bit
 * しかなく、試行上限が唯一の防御になっている。`rate_limits` への書き込みだけが
 * 壊れた状況（関数の作り直しで service_role への GRANT 漏れ、接続逼迫など）では
 * 読み取りは通るため、総当たりが成立してしまう。
 *
 * ⚠️ 認証・本人確認に関わるアクションを追加したら、ここにも必ず足すこと。
 * ここに無いアクションは従来どおり fail-open のままになる。
 */
export const FAIL_CLOSED_ACTIONS: ReadonlySet<RateLimitActionType> = new Set([
  // ログイン試行
  RATE_LIMIT_ACTION.LOGIN_IP,
  'login',
  // 二段階認証コード（6桁。上限が唯一の防御）
  RATE_LIMIT_ACTION.TOTP_VERIFY,
  RATE_LIMIT_ACTION.TOTP_SETTINGS_VERIFY,
  // メールのワンタイムコード
  RATE_LIMIT_ACTION.OTP_VERIFY,
  RATE_LIMIT_ACTION.OTP_SEND_DAILY,
  'registration',
  // パスワードの変更・再設定
  RATE_LIMIT_ACTION.PASSWORD_RESET_REQUEST,
  RATE_LIMIT_ACTION.PASSWORD_RESET_CONFIRM,
  RATE_LIMIT_ACTION.CHANGE_PASSWORD,
  'password_change',
  // アカウント作成
  RATE_LIMIT_ACTION.REGISTER,
  // admin によるアカウント発行。パスワード設定リンクを任意の宛先へ送れるため、
  // 判定できないまま通すと踏み台として使われうる
  RATE_LIMIT_ACTION.ADMIN_ACCOUNT_ISSUE,
  // ⚠️ ADMIN_AWARD_SYNC / ADMIN_AWARD_SYNC_STATUS はここに入れない。
  //    認証・本人確認に関わらず、DB 不調時に拒否側へ倒すと admin 自身の
  //    復旧手段まで塞ぐ。OpenAI の課金は伴うが、上限超過のリスクより
  //    可用性を取る。
]);

/**
 * 判定不能時に拒否するアクションかどうか
 *
 * @param actionType - アクション種別
 * @returns 拒否側へ倒すなら true
 */
export function isFailClosedAction(actionType: RateLimitActionType): boolean {
  return FAIL_CLOSED_ACTIONS.has(actionType);
}

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
   * 認証必須の読み取り。自分のデータしか読めず外部APIも呼ばないので、
   * 濫用の実害は小さい。
   *
   * ⚠️ これは**12ルートが共有する**カウンタ。1画面を開くだけで複数本消費する
   * （`/watchlist` のコールドロードで実測5〜7本。サイドバーとカレンダーの
   * 分は全ページで固定的にかかる）。
   *
   * ## 窓を 10分 → 1分 に縮めた理由（#934）
   *
   * `consume_rate_limit`（`20261019013008`）がカウンタをリセットするのは
   * **`last_attempt_at <= now() - windowMinutes`**、つまり
   * 「そのカウンタに windowMinutes 間まったくアクセスが無い」ときだけ。
   * 操作が途切れなければ `attempts` は単調増加する。
   *
   * ⚠️ したがって maxAttempts は「◯回 / windowMinutes」という**レートではない**。
   * 「アイドルを挟むまでの通算回数」である。10分窓のまま上限だけ増やしても、
   * 連続操作では遅かれ早かれ必ず到達し、しかも超過時のロックが10分続く。
   *
   * 窓を1分にすると、
   * - 1分の操作の途切れでカウンタが戻る（通常利用では実質当たらない）
   * - 超過しても**ロックは1分**で済む（12ルートが10分死ぬのを避ける）
   * - 持続レートの上限は 200回/分 に締まる（10分窓の 1200 より厳しい）
   *
   * 人間の最速（10画面遷移/分 × 7本 = 70回/分）に対して約3倍の余裕がある。
   *
   * ## 残っている弱点
   *
   * `watchlist` / `favorites` の GET は infinite query で、`maxPages` 未設定の
   * ため invalidate のたびに読み込み済み全ページを取り直す。大量の項目を
   * 持つ利用者が連続操作すると、この枠を単独で食い潰しうる（#964）。
   */
  READ_USER_DATA: { maxAttempts: 200, windowMinutes: 1 },
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
  /**
   * 受賞作品の手動同期。
   *
   * 1回の実行が最大約20分かかり、カンヌ・ゴールデングローブでは OpenAI の
   * 課金が実際に発生する（部門数ぶん記事全文を送るため）。admin セッションを
   * 奪われた場合の課金被害を上限で抑える。
   *
   * 年を1件ずつ投入する運用なので10回/時で十分な余裕がある。
   */
  ADMIN_AWARD_SYNC: { maxAttempts: 10, windowMinutes: 60 },
  /**
   * 手動同期ジョブの進捗ポーリング。
   *
   * AWARD_SYNC_POLL_INTERVAL_MS = 5000 で AWARD_SYNC_STALE_MINUTES = 25 分
   * 回すと300回。読み取りのみで外部APIを呼ばないため、倍の余裕を取る。
   *
   * ⚠️ READ_USER_DATA に相乗りさせないこと。1ジョブで300回使うため、
   *    共有カウンタだと他の認証必須読み取りを巻き込んで枯らす。
   */
  ADMIN_AWARD_SYNC_STATUS: { maxAttempts: 600, windowMinutes: 30 },
  /**
   * admin ルートのロール確認（#965）。
   *
   * `withAdminAuth` はロールを**毎回DBから読む**（JWT の role は最大5分古く、
   * 剥奪直後の管理操作を通してしまうため）。その SELECT がレート制限より前に
   * あると、ログイン済みの非 admin が連打するだけで無制限に DB を読める。
   *
   * 識別子はセッションのユーザーID。admin かどうかの判定前なので、
   * **非 admin も含めた全ログインユーザー**がこのカウンタを持つ。
   *
   * 上限は受賞同期の進捗ポーリング（5秒間隔 = 12回/分、
   * `AWARD_SYNC_POLL_INTERVAL_MS`）の10倍を取る。admin の正常操作では
   * 到達せず、連打は止まる。
   *
   * ⚠️ `FAIL_CLOSED_ACTIONS` には入れない。ここは全 admin ルートの入口なので、
   * rate_limits の不調で拒否側へ倒すと admin 自身の復旧手段まで塞ぐ
   * （ADMIN_AWARD_SYNC_STATUS と同じ判断）。
   */
  ADMIN_ROLE_CHECK: { maxAttempts: 120, windowMinutes: 1 },
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
