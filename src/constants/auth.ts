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
  REGISTER_SUCCESS: '確認コードをメールに送信しました。',
  /** メール未認証エラー */
  EMAIL_NOT_VERIFIED:
    'メール認証が完了していません。登録時に送信された確認コードで認証してください。',
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
} as const;

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
 * セッション設定
 */
export const SESSION_CONFIG = {
  /** 非アクティブ時のセッション有効期限（秒） — 24時間 */
  IDLE_MAX_AGE_S: 24 * 60 * 60,
  /** 絶対有効期限（ミリ秒） — 7日間（アクティブでも強制ログアウト） */
  ABSOLUTE_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  /** last_login_at 更新間隔（ミリ秒） — 1時間 */
  LOGIN_UPDATE_INTERVAL_MS: 60 * 60 * 1000,
  /** パスワード変更チェック間隔（ミリ秒） — 5分 */
  PASSWORD_CHECK_INTERVAL_MS: 5 * 60 * 1000,
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
