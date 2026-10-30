/**
 * 管理者発行アカウントの案内メール送信（Resend統合）
 *
 * **パスワードは本文に載せない。** 載せると Resend のダッシュボードと受信箱に
 * 有効な認証情報が残り続け、失効もできない。期限付き・1回限りのリンクを渡し、
 * 本人にパスワードを決めてもらう。
 *
 * 設計: `.claude/documents/admin-account-design.md`
 */

import { Resend } from 'resend';

import { APP_NAME } from '@/constants/app';
import {
  DEFAULT_FROM_EMAIL,
  buildAdminAccountEmailSubject,
  buildAdminAccountEmailText,
} from '@/constants/email';

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL;

interface SendAdminAccountEmailParams {
  /** 送信先（DBには保存しない） */
  email: string;
  /** ログインに使うアカウント名 */
  username: string;
  /** トークン付きのパスワード設定URL */
  setupUrl: string;
  /** リンクの有効期限（分） */
  expiryMinutes: number;
  /** 再発行かどうか（文面を変える） */
  isReissue: boolean;
}

/**
 * アカウント発行・再発行の案内をメールで送信する
 *
 * @returns 送信できたかどうか
 */
export async function sendAdminAccountEmail({
  email,
  username,
  setupUrl,
  expiryMinutes,
  isReissue,
}: SendAdminAccountEmailParams): Promise<boolean> {
  // E2E/テスト用バイパス: 実送信をスキップして成功扱いにする。
  //
  // positive guard（fail-closed）: 明示的な E2E_TEST_MODE=true のときのみ許可し、
  // 機能個別の OTP_EMAIL_TEST_BYPASS も要求する。Vercel 本番では VERCEL_ENV で
  // 多層に強制無効化する（sendOtpEmail / sendPasswordResetEmail と同じ条件／#424）。
  // ※ NODE_ENV は CI も production のため判別に使えない。
  if (
    process.env.E2E_TEST_MODE === 'true' &&
    process.env.OTP_EMAIL_TEST_BYPASS === 'true' &&
    process.env.VERCEL_ENV !== 'production'
  ) {
    console.warn(
      '[OTP_EMAIL_TEST_BYPASS] sendAdminAccountEmail はテストモードのため実送信をスキップしました',
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
      subject: buildAdminAccountEmailSubject(isReissue),
      text: buildAdminAccountEmailText(
        username,
        setupUrl,
        expiryMinutes,
        isReissue,
      ),
    });

    if (error) {
      console.error('Failed to send admin account email:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send admin account email:', error);
    return false;
  }
}
