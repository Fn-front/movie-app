/**
 * メール関連の定数
 */

import { APP_NAME } from './app';

/**
 * デフォルトの送信元メールアドレス（フォールバック）
 */
export const DEFAULT_FROM_EMAIL = 'noreply@example.com';

/**
 * OTPメール件名
 */
export const OTP_EMAIL_SUBJECT = `[${APP_NAME}] 確認コード`;

/**
 * OTPメール本文を生成
 */
export function buildOtpEmailText(code: string): string {
  return `${APP_NAME}の確認コードです。

確認コード: ${code}

このコードは10分間有効です。
心当たりがない場合は、このメールを無視してください。`;
}
