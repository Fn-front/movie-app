/**
 * 認証関連の定数
 */

import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from './time';

/**
 * 認証エラーメッセージ
 */
export const AUTH_ERROR_MESSAGES = {
  /** 権限不足。未認証（401）と区別する。再ログインしても解決しない */
  FORBIDDEN: 'この操作を行う権限がありません。',
  /** データベース接続エラー */
  DB_CONNECTION_ERROR: 'データベース接続が利用できません。',
  /** 入力必須エラー */
  CREDENTIALS_REQUIRED: 'メールアドレスとパスワードを入力してください。',
  /** 認証情報エラー */
  INVALID_CREDENTIALS: 'メールアドレスまたはパスワードが正しくありません。',
  /** メールアドレス重複エラー */
  EMAIL_ALREADY_EXISTS: '既に登録済みのメールアドレスです。',
  /** 登録失敗 */
  REGISTER_FAILED: '登録に失敗しました。',
  /** 登録成功 */
  REGISTER_SUCCESS: '確認コードをメールに送信しました。',
  /**
   * メール未認証エラー（#1247）
   *
   * ⚠️ 「確認コードで認証してください」だけでは足りない。確認コードの入力
   * 画面は**リロードすると二度と出せず**、コードにも有効期限がある。
   * 実際に到達した利用者が次に取れる手は「新規登録をやり直す」だけなので、
   * それを書く（register は未認証の既存ユーザーを検出して上書きし、確認
   * 画面に戻してくれる。`src/app/api/auth/register/route.ts:185-195`）。
   *
   * ⚠️ 「**同じ**パスワードで」とは書かない。`register` は未認証の既存
   * ユーザーの `password_hash` を**無条件で上書き**する（旧パスワードとの
   * 照合は無い。同 `:199-207`）。狭く書くと、パスワードを思い出せない人が
   * 唯一の回復手段を「自分には使えない」と誤解する。
   *
   * ⚠️ この文言は**パスワード照合に成功した相手にしか出さない**こと。
   * 詳細は `AUTH_ERROR_CODE.EMAIL_NOT_VERIFIED`
   */
  EMAIL_NOT_VERIFIED:
    'メール認証が完了していません。お手数ですが、同じメールアドレスで新規登録をやり直してください。確認コードを再送します。',
  /** バリデーションエラー */
  VALIDATION_ERROR: '入力内容に誤りがあります。',
  /** 現在のパスワードが不正 */
  CURRENT_PASSWORD_INCORRECT: '現在のパスワードが正しくありません。',
  /** パスワード変更成功 */
  PASSWORD_CHANGED: 'パスワードを変更しました。',
  /** パスワード変更失敗 */
  PASSWORD_CHANGE_FAILED: 'パスワードの変更に失敗しました。',
  /** 未認証エラー */
  UNAUTHORIZED: '認証が必要です。ログインしてください。',
  /** 認証失敗（Cron等のBearer認証） */
  AUTH_FAILED: '認証に失敗しました。',
  /** レート制限超過 */
  RATE_LIMIT_EXCEEDED: 'しばらく時間をおいてから再度お試しください。',
  /** パスワード未設定（ソーシャルログインのみのユーザー） */
  PASSWORD_NOT_SET: 'パスワードが設定されていません。',
  /** 新旧パスワード同一 */
  SAME_PASSWORD: '現在のパスワードと同じパスワードには変更できません。',
  /** 登録処理サーバーエラー */
  REGISTER_SERVER_ERROR: '登録処理中にエラーが発生しました。',
  /**
   * 第2要素の入力が必要。
   *
   * パスワード照合に成功したあと、二段階認証が有効だった場合に返す。
   * クライアントはこれを受けて認証コードの入力欄を出す。
   * パスワードが正しい相手にしか返さないため、これ自体は情報を漏らさない。
   */
  TOTP_REQUIRED: '認証コードを入力してください。',
  /** 第2要素（メールのコード）の入力が必要 */
  EMAIL_OTP_REQUIRED: 'メールに送信した確認コードを入力してください。',
  /**
   * 第2要素のコードを送信できなかった。
   *
   * `TOTP_INVALID` と**必ず分ける**（`TOTP_UNAVAILABLE` と同じ理由）。
   */
  SECOND_FACTOR_SEND_FAILED:
    '確認コードを送信できませんでした。しばらく待ってからお試しください。',
  /**
   * 第2要素のコードの送信上限に達した。
   *
   * 1通も送っていないので、コードを待たせずリカバリーコードへ誘導する。
   */
  SECOND_FACTOR_SEND_LIMITED:
    '確認コードの送信回数が上限に達しました。リカバリーコードを入力してログインしてください。',
  /** 第2要素が不正 */
  TOTP_INVALID: '認証コードが正しくありません。',
  /** 第2要素の使い回し */
  TOTP_REUSED:
    'この認証コードは使用済みです。次のコードが表示されるまでお待ちください。',
  /**
   * 第2要素を検証できなかった（#1148）。
   *
   * DB の不調などで確認そのものが成立しなかったときに出す。
   * `TOTP_INVALID` と**必ず分ける**。入れ直しても直らないので、同じ文言だと
   * 利用者は正しいコードを繰り返し打ち続けることになる。
   */
  TOTP_UNAVAILABLE:
    '認証コードを確認できませんでした。時間をおいてもう一度お試しください。',
  /**
   * ログアウトに失敗した。
   *
   * `logout()` は次のいずれかで遷移を始めずに rethrow する。
   * 画面に留まるので、押し直せることを伝える。
   *
   * - csrf の取得に失敗した
   * - `/api/auth/signout` の POST に失敗した
   * - **セッションが消えたことを確認できなかった**（#1195）。
   *   CSRF 検証に落ちた POST は遷移先だけ返して Cookie を消さないため、
   *   成否は確認しないと分からない
   */
  LOGOUT_FAILED:
    'ログアウトできませんでした。通信状況を確認して、もう一度お試しください。',
} as const;

/**
 * `/auth/error` に出す文言（#1231）
 *
 * Auth.js がエラー時に `pages.error` へ `?error=<コード>` を付けて飛ばす。
 * 渡りうるのは `Configuration` / `AccessDenied` / `Verification` の3つ
 * （`node_modules/@auth/core/types.d.ts:176` の `ErrorPageParam`）。
 *
 * ⚠️ 知らないコードが来ても落とさず `DEFAULT` に倒す。Auth.js の内部
 * エラー種別は30以上あり（`node_modules/@auth/core/errors.d.ts:1`）、
 * 将来増える可能性もある。利用者に見せる文面は**原因を断定せず、次の
 * 行動が分かる**ものにする。
 */
export const AUTH_PAGE_ERROR_MESSAGES = {
  /** サーバー側の設定不備。利用者には直せない */
  Configuration:
    'ログインの設定に問題があるため、現在ログインできません。お手数ですが、管理者にご連絡ください。',
  /** プロバイダ側で拒否された、またはアカウントが許可されていない */
  AccessDenied:
    'ログインが許可されませんでした。別の方法でログインするか、管理者にご連絡ください。',
  /** メールのリンクが期限切れ・使用済み */
  Verification:
    'リンクの有効期限が切れたか、既に使用されています。お手数ですが、もう一度やり直してください。',
  /** 上記以外。コードが無い場合もここ */
  DEFAULT:
    'ログイン処理中にエラーが発生しました。お手数ですが、もう一度お試しください。',
} as const;

/**
 * `/auth/signin?error=` に出す文言（#1242）
 *
 * Auth.js は失敗の飛び先をエラーの `kind` で分ける
 * （`node_modules/@auth/core/index.js:135`）。`SignInError` を継承した
 * ものだけが `kind = 'signIn'` で、**`pages.error` ではなく `pages.signIn`**
 * へ戻る。`AccessDenied` / `Verification` は `AuthError` 直系なので
 * signin 側には来ない（`errors.js:64,395`）。`Configuration` と `DEFAULT`
 * は両方に要るため、`AUTH_PAGE_ERROR_MESSAGES` と文言が重複している。
 *
 * さらに `type` は「クライアントに見せてよい」集合
 * （`errors.js:412-421`）に無ければ **`Configuration` に差し替えられる**。
 * kind は元のまま signIn なので、`/auth/signin?error=Configuration` も来る。
 *
 * `Auth()` の catch から来るのは次の6つ。
 *
 * | code | 起きる場面 |
 * |---|---|
 * | `OAuthCallbackError` | プロバイダの同意画面で拒否した・中断した |
 * | `MissingCSRF` | CSRF トークンが合わない（画面を開いたまま放置等） |
 * | `CredentialsSignin` | `redirect: true` のパスワードログイン |
 * | `Configuration` | 上記以外の signIn 系（`OAuthSignInError` 等） |
 * | `OAuthAccountNotLinked` | **現構成では起きない**（下記） |
 * | `AccountNotLinked` | **現構成では起きない**（下記） |
 *
 * ⚠️ **ここに無い任意の値も来る。** `pages.signIn` を指定していると
 * `GET /api/auth/signin?error=<任意>` の `error` がそのまま転送される
 * （`lib/pages/index.js:56-60`）。`SessionRequired` もこの経路
 * （`next-auth/react.js:80-86` の `useSession({ required: true })`。
 * 本アプリは未使用）。だから `DEFAULT` への取りこぼしが必須になる。
 *
 * ⚠️ 知らないコードでも落とさず `DEFAULT` に倒す。`in` 演算子で引くと
 * `?error=__proto__` で描画が落ちる（#1240 で実際に踏んだ）。参照は
 * `resolveAuthErrorMessage`（`src/utils/authErrorMessage.ts`）を使う。
 */
export const SIGN_IN_PAGE_ERROR_MESSAGES = {
  /**
   * 同じメールアドレスのアカウントが別の方法で既にある
   *
   * ⚠️ **現構成では到達しない。将来アダプタを入れたときの備え。**
   * この2つを投げるのは Auth.js のアダプタ経路（`handle-login.js:106,149,
   * 188,250`）だけで、そこは `adapter` 未設定のとき同ファイル `:23-26` で
   * 早期 return される。本アプリは `adapter` を設定しておらず
   * （`src/lib/auth/auth.ts`）、アカウントの突き合わせは `signIn`
   * コールバックで自前にやっている（同 `:355-`）。
   *
   * そのため「Google で登録した人が GitHub を押す」は**エラーにならず、
   * メール一致で黙ってリンクされてログインできる**（プロバイダ側が
   * `email_verified: true` を返したときだけ）。失敗する経路
   * （メール未検証・DB障害）は `return false` → `AccessDenied` で、
   * これは `AuthError` 直系なので `/auth/error` 側に出る。
   *
   * 消さずに残すのは、アダプタを足した瞬間にこの2つが現れるため。
   * 文言は**アカウントの列挙にならない**。ここへ来るのはプロバイダ側の
   * 認証を通過した＝そのメールアドレスを持っていると証明できた相手だけで、
   * 他人のアドレスでは到達しない。逆に伏せると解決手段が無くなる
   */
  OAuthAccountNotLinked:
    'このメールアドレスは別の方法で登録されています。最初に登録したときの方法（他のソーシャルログイン、またはメールアドレスとパスワード）でログインしてください。',
  /** 上と同じ状況。Auth.js が投げ分けるので両方持つ（同じく現構成では到達しない） */
  AccountNotLinked:
    'このメールアドレスは別の方法で登録されています。最初に登録したときの方法（他のソーシャルログイン、またはメールアドレスとパスワード）でログインしてください。',
  /**
   * プロバイダ側で止まった
   *
   * 同意画面での拒否が大半だが、プロバイダの一時障害も同じコードで来る
   * （RFC 6749 4.1.2.1 のエラー応答全般）。断定せず両方に当てはめる
   */
  OAuthCallbackError:
    'ソーシャルログインが完了しませんでした。許可の画面でキャンセルした場合は、もう一度お試しください。',
  /** 画面を長く開いたままだと起きる。再読み込みで直る */
  MissingCSRF:
    'ログインを受け付けられませんでした。画面を再読み込みしてから、もう一度お試しください。',
  /**
   * パスワードログインの失敗
   *
   * 通常は `redirect: false` で自前処理するためここには来ないが、
   * 経路が増えたときに備える。**どのアカウントが存在するかを推測させない**
   * よう、`AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS` と同じ粒度に丸める
   */
  CredentialsSignin: 'メールアドレスまたはパスワードが正しくありません。',
  /** サーバー側の設定不備。利用者には直せない */
  Configuration:
    'ログインの設定に問題があるため、現在ログインできません。お手数ですが、管理者にご連絡ください。',
  /** 上記以外。知らないコードはここへ倒す */
  DEFAULT: 'ログインできませんでした。お手数ですが、もう一度お試しください。',
} as const;

/**
 * ログイン画面の補足
 */
export const AUTH_HINTS = {
  /**
   * ユーザー名ログインの案内
   *
   * 管理者が発行したアカウントはメールアドレスを持たない（`users.email` は
   * 受信できない合成値）。ログイン欄は以前から両対応でラベルにも書いて
   * あったが、それでも自分のメールアドレスを入れて失敗する人がいた。
   * どこに書いてあるかまで示す（#1237）
   */
  USERNAME_LOGIN:
    '管理者からアカウントを発行された方は、発行メールに記載のアカウント名でログインしてください。',
} as const;

/**
 * Credentials 認証のエラーコード
 *
 * `authorize` が投げたエラーの種類をクライアントへ伝えるためのもの。
 * Auth.js は `CredentialsSignin` を継承したエラーの `code` だけを
 * `signIn()` の戻り値に載せる（`node_modules/@auth/core/index.js:133`）。
 *
 * エラークラス側は `src/lib/auth/authErrors.ts`。定数をこちらに置くのは、
 * クライアントコンポーネントから `next-auth`（ESM）を引き込まないため。
 *
 * ⚠️ `code` は URL に出る。利用者に見せてよい粒度に留めること。
 * ここのコードはいずれもパスワード照合を通過した相手にしか返らないため、
 * 二段階認証の有無をパスワードを知らない第三者に教えることはない。
 */
export const AUTH_ERROR_CODE = {
  /** 第2要素（認証アプリ）の入力が必要（パスワードは正しい） */
  TOTP_REQUIRED: 'totp_required',
  /**
   * 第2要素（メールのコード）の入力が必要（パスワードは正しい）
   *
   * `TOTP_REQUIRED` と分けるのは、クライアントが出す入力欄が変わるため。
   * メールOTP では再送ボタンとカウントダウンが要る。
   */
  EMAIL_OTP_REQUIRED: 'email_otp_required',
  /**
   * 第2要素のコードを送信できなかった
   *
   * ⚠️ `TOTP_INVALID` と**必ず分ける**。入れ直しても直らないので、同じ文言だと
   * 利用者は正しいコードを繰り返し打ち続ける（#1148 と同じ理由）。
   */
  SECOND_FACTOR_SEND_FAILED: 'second_factor_send_failed',
  /**
   * 第2要素のコードの送信上限に達した
   *
   * ⚠️ `EMAIL_OTP_REQUIRED` と**必ず分ける**。1通も送っていないので、
   * 「メールに送ったコードを入力してください」と出すと届かないコードを
   * 待たせることになる。この状態の出口はリカバリーコードだけ。
   */
  SECOND_FACTOR_SEND_LIMITED: 'second_factor_send_limited',
  /** 第2要素が不正 */
  TOTP_INVALID: 'totp_invalid',
  /** 第2要素の使い回し */
  TOTP_REUSED: 'totp_reused',
  /**
   * メール認証が未完了（#1247）
   *
   * ⚠️ **パスワード照合（または OTP コードの検証）に成功したときだけ返す。**
   * 先に返すと「このメールアドレスは登録済み」をパスワードを知らない相手へ
   * 教えることになり、アカウント列挙を許す。`TOTP_REQUIRED` と同じ扱い。
   */
  EMAIL_NOT_VERIFIED: 'email_not_verified',
  /** 試行回数の上限 */
  RATE_LIMITED: 'rate_limited',
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODE)[keyof typeof AUTH_ERROR_CODE];

/**
 * トースト通知タイトル
 */
export const TOAST_TITLES = {
  /** ログイン成功 */
  LOGIN_SUCCESS: 'ログイン成功',
  /** ログインエラー */
  LOGIN_ERROR: 'ログインエラー',
  /** 登録完了 */
  REGISTER_SUCCESS: '登録完了',
  /** 登録エラー */
  REGISTER_ERROR: '登録エラー',
  /** パスワード変更完了 */
  PASSWORD_CHANGE_SUCCESS: 'パスワード変更完了',
  /** パスワード変更エラー */
  PASSWORD_CHANGE_ERROR: 'パスワード変更エラー',
} as const;

/**
 * トースト通知メッセージ
 */
export const TOAST_MESSAGES = {
  /** ログイン成功時の説明 */
  LOGIN_SUCCESS_DESCRIPTION: 'ホーム画面に移動します。',
  /** 登録成功時の説明 */
  REGISTER_SUCCESS_DESCRIPTION: '確認コードをメールに送信しました。',
  /** メール認証完了時の説明 */
  REGISTER_VERIFIED_DESCRIPTION:
    'メール認証が完了しました。ログインしてください。',
} as const;

/**
 * セッションCookieの名前
 *
 * 本番は `__Secure-` 接頭辞を付ける。この接頭辞が付いたCookieは、
 * **`Secure` 属性の無い `Set-Cookie` をブラウザが拒否する**（CookiePrefixes）。
 * そのため名前と属性は必ずセットで扱う（`getSessionCookieOptions`）。
 *
 * モジュール初期化時ではなく呼び出し時に `NODE_ENV` を読む。本番相当の挙動を
 * テストから検証できるようにするため（バンドル時に定数畳み込みされるので
 * 実行時コストは無い）。
 */
export const getSessionCookieName = (): string =>
  process.env.NODE_ENV === 'production'
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

/**
 * セッションCookieの属性
 *
 * NextAuth の発行時（`src/lib/auth/auth.ts` の `cookies.sessionToken.options`）と、
 * 失効セッションを消す proxy（`src/proxy.ts`）で**同じ定義を使う**ためにここへ置く。
 * 属性が1つでも食い違うとブラウザは別のCookieとして扱い、削除が効かない（#1174）。
 */
export const getSessionCookieOptions = (): {
  httpOnly: boolean;
  sameSite: 'lax';
  path: string;
  secure: boolean;
} => ({
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
});

/**
 * セッション設定
 */
export const SESSION_CONFIG = {
  /** 非アクティブ時のセッション有効期限（秒） — 24時間 */
  IDLE_MAX_AGE_S: 24 * 60 * 60,
  /** 絶対有効期限（ミリ秒） — 7日間（アクティブでも強制ログアウト） */
  ABSOLUTE_MAX_AGE_MS: 7 * MS_PER_DAY,
  /** last_login_at 更新間隔（ミリ秒） — 1時間 */
  LOGIN_UPDATE_INTERVAL_MS: MS_PER_HOUR,
  /** パスワード変更チェック間隔（ミリ秒） — 5分 */
  PASSWORD_CHECK_INTERVAL_MS: 5 * MS_PER_MINUTE,
  /**
   * パスワード変更チェックの取得に失敗したときの再確認間隔（ミリ秒）— 10秒
   *
   * 失敗したら確認を終えたことにしない（#1193）。ただし完全に据え置くと、
   * 権限事故やスキーマキャッシュのような**恒久的な**失敗で毎リクエスト
   * 引き直すことになり、弱っているDBを押し続ける。
   * 失効の窓は 5分 → 10秒 に縮むので目的は果たせる。
   */
  PASSWORD_CHECK_RETRY_MS: 10 * MS_PER_SECOND,
} as const;

/**
 * パスワードを設定・変更したことを同じ画面の他の節へ伝えるイベント（#1372）
 *
 * ⚠️ セッション（JWT）の `hasPassword` は
 * `SESSION_CONFIG.PASSWORD_CHECK_INTERVAL_MS` のスロットル越しにしか
 * 追従しないため、設定画面に並ぶ他の節（二段階認証）は変更に気づけない。
 * 初回パスワードを設定した直後に二段階認証を設定しようとすると、画面は
 * 確認コードを求めるのにサーバーはパスワードを求める、という行き止まりに
 * なっていた。再読み込みの合図だけを流して、値そのものは各節が
 * **サーバーから**取り直す。
 */
export const PASSWORD_CHANGE_EVENT = 'movie-app:password-change';

/**
 * bcryptハッシュのコスト
 */
export const BCRYPT_COST = 12;

/**
 * 照合相手が居ないときに時間を合わせるためのダミーハッシュ（#1256）
 *
 * ログインは、ユーザーが見つからない場合や `password_hash` が無い場合に
 * **bcrypt を回さずに即 return** していた。そのため応答時間が
 * 「存在しない: 1ms」「存在する: ~250ms」と分かれ、**そのメールアドレスが
 * 登録済みかどうかを時間差で判定できた**。
 *
 * 照合相手が居ないときはこれと比較して、計算時間だけ揃える。
 * `register` が列挙防止のためだけに `bcrypt.hash` を回しているのと同じ考え方
 * （`src/app/api/auth/register/route.ts:132`）。
 *
 * ⚠️ **コストは `BCRYPT_COST` と一致させること。** ずれると逆に差が出る。
 * この値は `$2b$12$` で始まる必要がある（12 = `BCRYPT_COST`）。
 *
 * ⚠️ 平文の由来は無い（`bcrypt.compare` は常に false を返す）。
 * ここに本物のパスワードのハッシュを置かないこと
 */
export const DUMMY_PASSWORD_HASH =
  '$2b$12$C6UzMDM.H6dfI/f/IKcEe.Op7n5YZ3gCFfKBDQ0BN2hEm9MKnqp4K';

/**
 * 漏洩パスワード照合（HIBP Pwned Passwords API）の設定
 *
 * NIST SP 800-63B は文字種の強制よりも漏洩パスワードリストとの照合を
 * 推奨している。現行ポリシーだけでは `Password1234` のような漏洩上位の
 * 文字列を通してしまい、クレデンシャルスタッフィングに直結する（#652）。
 */
export const PWNED_PASSWORD_CONFIG = {
  /**
   * k-anonymity 検索のエンドポイント
   *
   * SHA-1 の先頭5文字だけを送り、該当する接尾辞の一覧を受け取る。
   * 平文もフルハッシュも外部に出さない。
   */
  API_BASE_URL: 'https://api.pwnedpasswords.com/range',
  /**
   * リクエストのタイムアウト（ミリ秒）
   *
   * 登録・パスワード変更の応答時間に直接乗るため短くする。超過時は
   * 照合をスキップして通す（fail-open）。
   */
  TIMEOUT_MS: 3000,
} as const;

/**
 * ユーザーロール
 *
 * DB の users.role カラムに格納する値。将来的に 'admin' 等が増えても
 * この定数を経由するようにしておくと集約されやすい。
 */
export const USER_ROLE = {
  USER: 'user',
  /**
   * 管理者。アカウントの発行・再発行ができる。
   *
   * DB 側は `chk_user_role` で `'user' | 'admin'` に制限済み。
   * 付与・剥奪はDBを直接更新する（画面からは変更できない）。
   */
  ADMIN: 'admin',
} as const;
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

/**
 * バリデーションメッセージ
 */
export const VALIDATION_MESSAGES = {
  /** メールアドレス必須 */
  EMAIL_REQUIRED: 'メールアドレスを入力してください',
  /** メールアドレスが長すぎる */
  EMAIL_TOO_LONG: 'メールアドレスが長すぎます',
  /** メールアドレス形式不正 */
  EMAIL_INVALID: 'メールアドレスの形式が正しくありません',
  /**
   * ログイン識別子の形式不正。
   *
   * ログイン欄はメールアドレスとアカウント名を兼用するため、どちらとしても
   * 解釈できない入力に使う（`@` を含めばメール、含まなければアカウント名）。
   */
  LOGIN_IDENTIFIER_INVALID:
    'メールアドレスまたはアカウント名の形式が正しくありません',
  /** パスワード最小文字数 */
  PASSWORD_MIN_LENGTH: (min: number) =>
    `パスワードは${min}文字以上で入力してください`,
  /** パスワード最大バイト数 */
  PASSWORD_MAX_BYTES: (max: number) =>
    `パスワードは${max}バイト以内で入力してください（日本語は1文字3バイト）`,
  /** 漏洩が確認されているパスワード */
  PASSWORD_PWNED:
    'このパスワードは過去の情報漏洩で確認されています。別のパスワードを設定してください',
  /** パスワードに大文字を含める */
  PASSWORD_UPPERCASE: 'パスワードに大文字を含めてください',
  /** パスワードに小文字を含める */
  PASSWORD_LOWERCASE: 'パスワードに小文字を含めてください',
  /** パスワードに数字を含める */
  PASSWORD_NUMBER: 'パスワードに数字を含めてください',
  /** パスワード確認必須 */
  CONFIRM_PASSWORD_REQUIRED: 'パスワード（確認）を入力してください',
  /** パスワード必須 */
  PASSWORD_REQUIRED: 'パスワードを入力してください',
  /** パスワード不一致 */
  PASSWORD_MISMATCH: 'パスワードが一致しません',
  /** ユーザー名が長すぎる */
  NAME_TOO_LONG: 'ユーザー名は100文字以内で入力してください',
  /** OTP検証済みトークン必須 */
  OTP_TOKEN_REQUIRED:
    'OTP検証が完了していません。確認コードを再送信してください',
  /** 現在のパスワード必須 */
  CURRENT_PASSWORD_REQUIRED: '現在のパスワードを入力してください',
} as const;

/**
 * アカウント削除のメッセージ（#932）
 */
export const ACCOUNT_DELETE_MESSAGES = {
  /** 削除完了 */
  SUCCESS: 'アカウントを削除しました。ご利用ありがとうございました。',
  /** 利用者が見つからない（セッションはあるが行が無い） */
  NOT_FOUND: 'アカウントが見つかりません。再度ログインしてください。',
  /** 想定外の失敗 */
  FAILED: 'アカウントの削除に失敗しました。時間をおいて再度お試しください。',
  /** 削除は通ったがログアウトに失敗した */
  LOGOUT_FAILED:
    'アカウントは削除されましたが、ログアウトできませんでした。ページを再読み込みしてください。',
  /** 確認ダイアログの説明 */
  CONFIRM_DESCRIPTION:
    'アカウントを削除すると、お気に入り・ウォッチリスト・レビューなどすべてのデータが消えます。この操作は取り消せません。',
} as const;
