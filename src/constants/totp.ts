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
} as const;
