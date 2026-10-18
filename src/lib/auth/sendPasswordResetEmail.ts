/**
 * パスワードリセットメールの送信（Resend統合）
 */

import { Resend } from 'resend';

import { APP_NAME } from '@/constants/app';
import {
  DEFAULT_FROM_EMAIL,
  buildPasswordResetEmailSubject,
  buildPasswordResetEmailText,
} from '@/constants/email';
import { PASSWORD_RESET_CONFIG } from '@/constants/passwordReset';

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL;

/**
 * パスワード再設定用のリンクをメールで送信する
 *
 * @param email - 送信先メールアドレス
 * @param resetUrl - トークン付きの再設定URL
 * @returns 送信できたかどうか
 */
export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
): Promise<boolean> {
  // E2E/テスト用バイパス: 実送信をスキップして成功扱いにする。
  //
  // positive guard（fail-closed）: 明示的な E2E_TEST_MODE=true のときのみ許可し、
  // 機能個別の OTP_EMAIL_TEST_BYPASS も要求する。Vercel 本番では VERCEL_ENV で
  // 多層に強制無効化する（sendOtpEmail と同じ条件に揃えてある／#424）。
  // ※ NODE_ENV は CI も production のため判別に使えない。
  if (
    process.env.E2E_TEST_MODE === 'true' &&
    process.env.OTP_EMAIL_TEST_BYPASS === 'true' &&
    process.env.VERCEL_ENV !== 'production'
  ) {
    console.warn(
      '[OTP_EMAIL_TEST_BYPASS] sendPasswordResetEmail はテストモードのため実送信をスキップしました',
    );
    return true;
  }

  if (!resendApiKey) {
    console.error('RESEND_API_KEY is not configured');
    return false;
  }

  const resend = new Resend(resendApiKey);

  try {
    const { error } = await resend.emails.send({
      from: `${APP_NAME} <${fromEmail}>`,
      to: email,
      subject: buildPasswordResetEmailSubject(),
      text: buildPasswordResetEmailText(
        resetUrl,
        PASSWORD_RESET_CONFIG.EXPIRY_MINUTES,
      ),
    });

    if (error) {
      console.error('Failed to send password reset email:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return false;
  }
}
