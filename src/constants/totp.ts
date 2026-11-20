/**
 * TOTP（二段階認証）の定数
 */

/**
 * TOTP の仕様パラメータ
 *
 * 値は認証アプリ（Google Authenticator / 1Password 等）の既定に合わせる。
 * ここを変えると、既に登録済みの利用者のコードが合わなくなる。
 */
export const TOTP_CONFIG = {
  /** HMAC のハッシュアルゴリズム（RFC 6238 の既定） */
  ALGORITHM: 'sha1',
  /** コードの桁数 */
  DIGITS: 6,
  /** 時間ステップ（秒） */
  STEP_SECONDS: 30,
  /**
   * 許容する前後のステップ数。
   *
   * 端末の時刻ずれを吸収するためのもの。1 なら前後30秒（計90秒分）を受け付ける。
   * 広げるほど総当たりの成功確率が上がるため、安易に増やさない。
   */
  WINDOW: 1,
  /** 共有鍵のバイト長（RFC 4226 は160bit以上を推奨） */
  SECRET_BYTES: 20,
} as const;

/**
 * リカバリーコードの設定
 *
 * 認証アプリを失った利用者の唯一の復旧手段。
 */
export const RECOVERY_CODE_CONFIG = {
  /** 発行する個数 */
  COUNT: 10,
  /** 1個あたりの文字数（ハイフンを除く） */
  LENGTH: 10,
  /** 読みやすさのために区切る位置 */
  GROUP_SIZE: 5,
} as const;

/**
 * `otpauth://` URI に表示する発行者名
 *
 * 認証アプリの一覧で「どのサービスか」を示すラベルになる。
 */
export const TOTP_ISSUER = 'Movie App';

/**
 * TOTP 関連のエラーメッセージ
 */
export const TOTP_ERROR_MESSAGES = {
  /** コードが不正 */
  INVALID_CODE: '認証コードが正しくありません。',
  /** 同じコードの再利用 */
  CODE_ALREADY_USED:
    'この認証コードは使用済みです。次のコードが表示されるまでお待ちください。',
  /** リカバリーコードが不正 */
  INVALID_RECOVERY_CODE: 'リカバリーコードが正しくありません。',
  /** 既に有効化済み */
  ALREADY_ENABLED: '二段階認証は既に有効です。',
  /** 未設定 */
  NOT_CONFIGURED: '二段階認証が設定されていません。',
  /** 設定を開始していない */
  SETUP_NOT_STARTED: '設定が開始されていません。最初からやり直してください。',
  /** 有効化に成功 */
  ENABLED: '二段階認証を有効にしました。',
  /** 無効化に成功 */
  DISABLED: '二段階認証を無効にしました。',
  /** リカバリーコードを再発行した */
  RECOVERY_CODES_REGENERATED:
    'リカバリーコードを再発行しました。以前のコードは使えません。',
  /** 操作に失敗 */
  OPERATION_FAILED: '処理に失敗しました。',
} as const;

/**
 * 設定操作のレート制限（回 / 窓）
 *
 * 無効化・再発行はコードの所持を要求するため、ここが総当たりの入口になる。
 * ログイン時（TOTP_VERIFY）と同じ厳しさにする。
 *
 * ⚠️ 厳しさは同じだが**カウンタは分ける**（`TOTP_SETTINGS_VERIFY`）。
 * 同じ `action_type` を使っていた頃は識別子もユーザーIDで同一だったため、
 * rate_limits の同じ行を共有していた。設定画面での誤操作がログインの
 * 第2要素まで巻き添えでロックするため、#940 で分離した。
 */
export const TOTP_SETTINGS_LIMIT = {
  maxAttempts: 5,
  windowMinutes: 15,
} as const;

/**
 * 設定途中の行（`user_totp.confirmed_at IS NULL`）が有効でいられる時間（分）
 *
 * ⛔ **無期限にしない**（#1368 のレビュー）。`totp/enable` は保留行だけを
 * 見るので、`totp/setup` の再認証を通り抜けた保留行が1つでもあると、
 * **後からいつでも有効化できる**。再認証を足す前に作られた行がまさにそれで、
 * 1回だけの掃除（`20261121090000_cleanup_unconfirmed_user_totp.sql`）に
 * 加えて、ここで時間の上限も設ける。
 *
 * ⚠️ 短くしすぎない。QRを読み取って6桁を入れるまでの時間で、
 * 認証アプリの追加に手間取る利用者もいる。メールOTP のコード自体は
 * `OTP_CONFIG.EXPIRY_MINUTES`（30分）で別途切れる。
 */
export const TOTP_SETUP_PENDING_TTL_MINUTES = 60;
