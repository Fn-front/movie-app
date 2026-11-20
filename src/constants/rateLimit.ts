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
  /**
   * 未認証の認証系ルートの送信元単位の上限（IPアドレス単位）
   *
   * ⚠️ メールアドレス単位の上限と**置き換えるのではなく、手前に重ねる**。
   * メール単位は「同一の宛先へ何通送れるか」を抑えるもので、
   * 識別子を**いくつ作れるか**は抑えていない。宛先を変えるだけで
   * `rate_limits` の行が無制限に増やせる状態だった。
   *
   * ⛔ メール単位の識別子をIPに置き換えてはいけない。IPごとにカウンタが
   * 分かれると、同一メールボックスへの送信数をIP数だけ掛け算できる
   * （#641 / #644。`.claude/rules/api-route.md`「例外1」）。
   *
   * ルートごとにカウンタを分ける。1つにまとめると、パスワードを忘れた
   * 利用者が連続で再発行しただけで、同じ回線の別の人が新規登録できなくなる。
   */
  REGISTER_IP: 'register_ip',
  /**
   * OTP送信の送信元単位の上限（IPアドレス単位）
   *
   * ⚠️ 他の `*_IP` とは塞いでいる穴が違う（#1341）。このルートは未登録
   * アドレスだと列挙防止の early return に落ちて `OTP_SEND_DAILY` を
   * 消費しないため、`rate_limits` の行は増えない。守っているのは
   * 「1リクエストごとの `users` SELECT と `randomDelay()` の 200〜500ms」。
   * 列挙を防ぐために**わざと重くしている**処理なので、天井が無いと
   * そのコストがそのまま攻撃者の武器になる。
   */
  OTP_SEND_IP: 'otp_send_ip',
  /** OTP検証の送信元単位の上限（IPアドレス単位。上の REGISTER_IP と同じ理由） */
  OTP_VERIFY_IP: 'otp_verify_ip',
  /** パスワード再設定の発行の送信元単位の上限（IPアドレス単位。同上） */
  PASSWORD_RESET_REQUEST_IP: 'password_reset_request_ip',
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
  /**
   * 第2要素コードのメール送信の上限（ユーザー単位）
   *
   * `OTP_SEND_DAILY` とカウンタを分ける。共有すると、ログインの多さが
   * 新規登録のメール確認（`auth/register`）とパスワード変更の本人確認
   * （`auth/otp/send`）を巻き添えにする。`TOTP_VERIFY` をログインと設定で
   * 分けた #940 と同じ発想。
   *
   * ⚠️ 検証側の `TOTP_SETTINGS_VERIFY` とも重ねない。重ねると、メールOTP の
   * 利用者は無効化のたびに「コード送信 + コード入力」で2枠使い、2回しくじる
   * だけで15分間すべての二段階認証操作が 429 になる。
   */
  TWO_FACTOR_SEND: 'two_factor_send',
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
  // 未認証の認証系ルートの送信元単位（LOGIN_IP と同じ扱い）
  RATE_LIMIT_ACTION.REGISTER_IP,
  RATE_LIMIT_ACTION.OTP_SEND_IP,
  RATE_LIMIT_ACTION.OTP_VERIFY_IP,
  RATE_LIMIT_ACTION.PASSWORD_RESET_REQUEST_IP,
  // 二段階認証コード（6桁。上限が唯一の防御）
  RATE_LIMIT_ACTION.TOTP_VERIFY,
  RATE_LIMIT_ACTION.TOTP_SETTINGS_VERIFY,
  // メールのワンタイムコード
  RATE_LIMIT_ACTION.OTP_VERIFY,
  RATE_LIMIT_ACTION.OTP_SEND_DAILY,
  // 第2要素の送信。通さないとログインできなくなるが、通すと上限が無言で
  // 消える。第2要素については「送れないこと」より「無制限に送れること」の
  // ほうが危険なので、他の認証系と揃えて拒否側へ倒す
  RATE_LIMIT_ACTION.TWO_FACTOR_SEND,
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
 * `releaseRateLimit` で枠を戻してよいアクション（#1266）
 *
 * `release_rate_limit` RPC は `locked_until` も消すため、総当たりを止める
 * アクションへ転用すると**ロック解除の手段**になる。戻してよいのは
 * 「数えた資源を実際には消費しなかった」と言い切れるものだけ。
 *
 * ⚠️ `FAIL_CLOSED_ACTIONS` を拒否リストにする案は採れない。
 * ここの2つはどちらもそちらに入っており、正当な呼び出し元まで弾いてしまう。
 *
 * 判断の基準は**何を数えているか**。「送った通数」なら戻してよく、
 * 「検証の試行回数」（`otp_verify` / `totp_verify` / `login` 等）なら
 * 戻してはいけない。後者で戻すと総当たりのロックを解除する手段になる。
 *
 * ⚠️ **ここを増やすだけでは効かない。** DB 側の `release_rate_limit` にも
 * 同じ許可リストがあり（`20261119090254_restrict_release_rate_limit_to_allowlist.sql`）、
 * そちらに無いアクションは例外になる。食い違っても「枠が戻らないだけ」で
 * ロックは解除されないため、安全側に倒れる。
 */
export const RELEASABLE_RATE_LIMIT_ACTIONS = [
  RATE_LIMIT_ACTION.OTP_SEND_DAILY,
  RATE_LIMIT_ACTION.TWO_FACTOR_SEND,
] as const;

/** 枠を戻してよいアクションの型 */
export type ReleasableRateLimitAction =
  (typeof RELEASABLE_RATE_LIMIT_ACTIONS)[number];

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
   * 未認証の認証系ルートの送信元単位の上限。
   *
   * メール単位の上限（REGISTER = 5回/60分 など）より**緩く**する。ここの役目は
   * 1つの宛先への試行を止めることではなく、**識別子を無制限に作らせないこと**。
   * 厳しくすると LOGIN_IP と同じく NAT や社内プロキシを巻き込む。
   *
   * 新規登録とパスワード再発行はどちらも頻度の低い操作なので 20回/60分。
   * 同一回線から1時間に20人が登録する状況は通常利用では起きない。
   */
  REGISTER_IP: { maxAttempts: 20, windowMinutes: 60 },
  /**
   * OTP送信の送信元単位の上限。
   *
   * 再送（60秒間隔）と新規登録・ログインの両方が通るため REGISTER_IP より
   * 厚くする。メールボックス側の保護は OTP_SEND_DAILY（メール単位）が担う。
   *
   * ⚠️ 窓は **15分**。上の REGISTER_IP / PASSWORD_RESET_REQUEST_IP（60分）
   * ではなく、同じログインのジャーニーを構成する LOGIN_IP（20回/15分）・
   * OTP_VERIFY_IP（50回/15分）に合わせる。
   *
   * 一度 60分 で入れたが、**超過したときのロックも60分**になるため、
   * NAT や社内プロキシの共有IPだと OTPログインが1時間止まる。しかも相方の
   * OTP_VERIFY_IP が持続レートで 200回/時なのに対し送信側だけ 40回/時となり、
   * 同じジャーニーの中で送信側が5倍きついという歪みがあった。
   *
   * ⚠️ **これはレートではない。**「15分あたり40回」ではなく、
   * **そのカウンタに15分の空白が入るまでの通算40回**（#934）。
   * `consume_rate_limit` のリセット条件は
   * `last_attempt_at <= v_window_start` だけなので、断続的に叩かれ続ける
   * 共有IPではカウンタが減らない。
   */
  OTP_SEND_IP: { maxAttempts: 40, windowMinutes: 15 },
  PASSWORD_RESET_REQUEST_IP: { maxAttempts: 20, windowMinutes: 60 },
  /**
   * OTP検証は登録・ログインの途中で**打ち間違いの再入力**が起きるため、
   * 上の2つより厚く取る。メール単位の上限（OTP_CONFIG.VERIFY_RATE_LIMIT）が
   * 本来の総当たり対策で、ここは行数の天井が目的。
   */
  OTP_VERIFY_IP: { maxAttempts: 50, windowMinutes: 15 },
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
   * 第2要素コードのメール送信。
   *
   * ⚠️ **窓を長くしてはいけない。** 上の #934 の説明のとおり、`maxAttempts` は
   * 「◯回 / windowMinutes」というレートではなく**アイドルを挟むまでの通算回数**。
   * `consume_rate_limit` がカウンタを戻すのは、その窓のあいだ一度も
   * アクセスが無かったときだけ。
   *
   * 当初案の `{ 20, 1440 }`（「20通/日」のつもり）は成立しない。24時間まるごと
   * 送信が無い日を挟まない限りカウンタが単調増加し、1日2回ログインする利用者は
   * 10日ほどで到達して**24時間ログイン不能**になる。濫用ではなく通常利用で詰む。
   *
   * 1時間窓なら1時間の間隔でカウンタが戻り、超過してもロックは1時間で済む。
   * 持続レートの上限は、別途かかる60秒の再送間隔が 60通/時 に抑える。
   */
  TWO_FACTOR_SEND: { maxAttempts: 10, windowMinutes: 60 },
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
   * AWARD_SYNC_POLL_SCHEDULE で AWARD_SYNC_STALE_MINUTES = 25 分
   * 回すと68回（#1282 以前は5秒等間隔で300回だった）。
   * 読み取りのみで外部APIを呼ばないため、上限には大きく余裕を残す。
   *
   * ⚠️ READ_USER_DATA に相乗りさせないこと。1ジョブで数十回使うため、
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
   * 上限は受賞同期の進捗ポーリングのピーク（開始直後の1分は5秒間隔 =
   * 12回/分。`AWARD_SYNC_POLL_SCHEDULE` の先頭段）の10倍を取る。
   * admin の正常操作では到達せず、連打は止まる。
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

/**
 * `rate_limits` の保持期間（時間）
 *
 * identifier にメールアドレス・IPアドレス・ユーザーIDが入るため、レート制限と
 * いう目的を達した行は残さない（個人情報保護法22条。#933）。
 *
 * ⚠️ 24時間にしてはいけない。最長ウィンドウは `OTP_CONFIG.DAILY_SEND_WINDOW_MINUTES`
 * （= 1440分）で**ちょうど24時間**のため、24時間だと有効なカウンタを消しうる。
 * 余裕を見て48時間にしている。
 *
 * 値を変えるときは、同じ数字が散っている以下もすべて揃えること。
 *
 * | 場所 | 内容 |
 * |---|---|
 * | `src/features/privacy/privacyPage/privacyPage.tsx` | この定数を描画（自動追従） |
 * | `supabase/migrations/20261106104932_*.sql` | 関数の `DEFAULT 48` と `COMMENT ON TABLE` |
 * | `supabase/migrations/20261106112019_*.sql` | 同上（`CREATE OR REPLACE` で再掲） |
 * | `.claude/documents/database-schema.md` | rate_limits のクリーンアップ節 |
 *
 * SQL の `DEFAULT` は呼び出し側が常に引数を渡すため実際には使われないが、
 * 手で RPC を叩いたときの安全側の値として揃えておく。
 *
 * ⚠️ 「保持期間 > 全レート制限ウィンドウの最大値」は
 * `src/lib/cleanup/expiredRecords.test.ts` が自動で検証する。
 * 新しいウィンドウを足して超えた瞬間にテストが落ちる。
 */
export const RATE_LIMIT_RETENTION_HOURS = 48;
