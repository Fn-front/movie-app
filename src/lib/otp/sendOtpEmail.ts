/**
 * OTPメール送信処理（Resend統合）
 */

import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@example.com';

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
      subject: '[Movie App] 確認コード',
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

/**
 * OTPメール本文を生成
 */
function buildOtpEmailText(code: string): string {
  return `Movie Appの確認コードです。

確認コード: ${code}

このコードは10分間有効です。
心当たりがない場合は、このメールを無視してください。`;
}
