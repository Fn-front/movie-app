/**
 * OTPメール送信処理（Resend統合）
 */

import { Resend } from 'resend';

import {
  DEFAULT_FROM_EMAIL,
  OTP_EMAIL_SUBJECT,
  buildOtpEmailText,
} from '@/constants/email';

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL;

/**
 * OTPコードをメールで送信
 *
 * @param email - 送信先メールアドレス
 * @param code - 6桁OTPコード
 * @returns 送信成功したかどうか
 */
export async function sendOtpEmail(
  email: string,
  code: string,
): Promise<boolean> {
  if (!resendApiKey) {
    console.error('RESEND_API_KEY is not configured');
    return false;
  }

  const resend = new Resend(resendApiKey);

  try {
    const { error } = await resend.emails.send({
      from: `Movie App <${fromEmail}>`,
      to: email,
      subject: OTP_EMAIL_SUBJECT,
      text: buildOtpEmailText(code),
    });

    if (error) {
      console.error('Failed to send OTP email:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send OTP email:', error);
    return false;
  }
}
