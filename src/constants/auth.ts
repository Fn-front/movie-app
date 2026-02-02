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
} as const;
