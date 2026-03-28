/**
 * OTP関連の定数
 */

/**
 * OTPアクション種別
 */
export const OTP_ACTION = {
  /** 新規登録時のメール認証 */
  REGISTRATION: 'registration',
  /** メールOTPログイン */
  LOGIN: 'login',
  /** パスワード変更の本人確認 */
  PASSWORD_CHANGE: 'password_change',
} as const;

export type OtpAction = (typeof OTP_ACTION)[keyof typeof OTP_ACTION];

/**
 * OTP設定
 */
export const OTP_CONFIG = {
  /** OTPコードの桁数 */
  CODE_LENGTH: 6,
  /** 有効期限（分） */
  EXPIRY_MINUTES: 10,
  /** 最大検証試行回数 */
  MAX_ATTEMPTS: 5,
  /** 再送間隔（秒） */
  RESEND_INTERVAL_SECONDS: 60,
  /** 日次送信上限 */
  DAILY_SEND_LIMIT: 5,
  /** 日次送信上限のウィンドウ（分） — 24時間 */
  DAILY_SEND_WINDOW_MINUTES: 1440,
  /** OTP検証済みトークンの有効期限（分） — verified_atからの経過時間 */
  VERIFIED_TOKEN_EXPIRY_MINUTES: 5,
} as const;

/**
 * OTPエラーメッセージ
 */
export const OTP_ERROR_MESSAGES = {
  /** OTPコードが間違っている */
  INVALID_CODE: '確認コードが間違っています。',
  /** OTPコードの有効期限切れ */
  CODE_EXPIRED: '確認コードの有効期限が切れました。再送信してください。',
  /** 試行回数超過 */
  MAX_ATTEMPTS_EXCEEDED:
    '試行回数の上限に達しました。新しいコードを再送信してください。',
  /** 再送間隔が短すぎる */
  RESEND_TOO_SOON: 'しばらく待ってから再送信してください。',
  /** 日次送信上限超過 */
  DAILY_LIMIT_EXCEEDED: '本日の送信上限に達しました。明日再度お試しください。',
  /** OTPコードが見つからない */
  CODE_NOT_FOUND: '有効な確認コードが見つかりません。再送信してください。',
  /** ユーザーが見つからない */
  USER_NOT_FOUND: '登録されていないメールアドレスです。',
  /** 既に認証済み */
  ALREADY_VERIFIED: 'このメールアドレスは既に認証済みです。',
  /** メール送信失敗 */
  EMAIL_SEND_FAILED: '確認コードの送信に失敗しました。',
  /** OTP検証が未完了 */
  OTP_NOT_VERIFIED: 'OTP検証が完了していません。',
  /** サーバーエラー */
  VERIFY_SERVER_ERROR: 'OTP検証中にエラーが発生しました。',
} as const;

/**
 * OTP成功メッセージ
 */
export const OTP_SUCCESS_MESSAGES = {
  /** コード送信成功 */
  CODE_SENT: '確認コードを送信しました。',
  /** コード再送信成功 */
  CODE_RESENT: '確認コードを再送信しました。',
  /** メール認証完了 */
  EMAIL_VERIFIED: 'メール認証が完了しました。',
  /** コード検証成功 */
  CODE_VERIFIED: 'コード検証に成功しました。',
} as const;
