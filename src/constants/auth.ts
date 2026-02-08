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
  /** メールアドレス重複エラー */
  EMAIL_ALREADY_EXISTS: '既に登録済みのメールアドレスです。',
  /** 登録失敗 */
  REGISTER_FAILED: '登録に失敗しました。',
  /** 登録成功 */
  REGISTER_SUCCESS: '登録が完了しました。',
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
  /** レート制限超過 */
  RATE_LIMIT_EXCEEDED: 'しばらく時間をおいてから再度お試しください。',
  /** 新旧パスワード同一 */
  SAME_PASSWORD: '現在のパスワードと同じパスワードには変更できません。',
} as const;

/**
 * bcryptハッシュのコスト
 */
export const BCRYPT_COST = 12;

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
  /** パスワード最小文字数 */
  PASSWORD_MIN_LENGTH: (min: number) =>
    `パスワードは${min}文字以上で入力してください`,
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
} as const;
