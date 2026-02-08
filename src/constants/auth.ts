/**
 * 認証関連の定数
 */

/**
 * 認証エラーメッセージ
 */
export const AUTH_ERROR_MESSAGES = {
  /** データベース接続エラー */
  DB_CONNECTION_ERROR: 'データベース接続が利用できません。',
  /** 入力必須エラー */
  CREDENTIALS_REQUIRED: 'メールアドレスとパスワードを入力してください。',
  /** 認証情報エラー */
  INVALID_CREDENTIALS: 'メールアドレスまたはパスワードが正しくありません。',
  /** メール未認証エラー */
  EMAIL_NOT_VERIFIED: 'メールアドレスが認証されていません。',
  /** メールアドレス重複エラー */
  EMAIL_ALREADY_EXISTS: '既に登録済みのメールアドレスです。',
  /** 登録成功 */
  REGISTER_SUCCESS: '確認コードをメールに送信しました。',
  /** バリデーションエラー */
  VALIDATION_ERROR: '入力内容に誤りがあります。',
} as const;

/**
 * OTP設定
 */
export const OTP_CONFIG = {
  /** OTPの桁数 */
  LENGTH: 6,
  /** OTPの有効期限（分） */
  EXPIRY_MINUTES: 10,
} as const;

/**
 * bcryptハッシュのコスト
 */
export const BCRYPT_COST = 12;
