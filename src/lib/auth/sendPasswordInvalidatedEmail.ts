/**
 * パスワード失効通知メールの送信（Resend統合）
 */

import { Resend } from 'resend';

import { APP_NAME } from '@/constants/app';
import { ROUTES } from '@/constants/common';
import {
  DEFAULT_FROM_EMAIL,
  buildPasswordInvalidatedEmailSubject,
  buildPasswordInvalidatedEmailText,
} from '@/constants/email';
import { getRequiredEnv } from '@/utils/env';

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL;

/**
 * 未検証アカウントの昇格に伴いパスワードを失効させたことを通知する（#1302）
 *
 * ベースURLはリクエストの Host ヘッダではなく設定値から取る。Host を信用すると
 * 攻撃者が仕込んだホスト宛のリンクをメールで配れてしまう
 * （`accountSetupUrl.ts` / `password-reset/request` と同じ方針）。
 *
 * ⚠️ **呼び出し側は戻り値でログインを止めないこと。** 失効そのものは
 * 通知より前に確定しており、ここで失敗しても保護は効いている。送信失敗で
 * 500 にすると、正しいコードを入れた利用者がログインできない行き止まりを
 * 作る（#1258 と同種）。
 *
 * @param email - 送信先メールアドレス
 * @returns 送信できたかどうか
 */
export async function sendPasswordInvalidatedEmail(
  email: string,
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
      '[OTP_EMAIL_TEST_BYPASS] sendPasswordInvalidatedEmail はテストモードのため実送信をスキップしました',
    );
    return true;
  }

  if (!resendApiKey) {
    console.error('RESEND_API_KEY is not configured');
    return false;
  }

  // ⚠️ **ここから下は try の中に閉じる。** この関数は throw しない契約で、
  // 呼び出し側（OTP検証）は戻り値を見ずに先へ進む。外に漏らすと、通知が
  // 送れないだけで済むはずの障害でログインまで落ちる。
  // 特に getRequiredEnv は未設定で throw する
  try {
    const resend = new Resend(resendApiKey);

    const settingsUrl = new URL(
      ROUTES.SETTINGS,
      getRequiredEnv('NEXTAUTH_URL'),
    ).toString();

    const { error } = await resend.emails.send({
      from: `${APP_NAME} <${fromEmail}>`,
      to: email,
      subject: buildPasswordInvalidatedEmailSubject(),
      text: buildPasswordInvalidatedEmailText(settingsUrl),
    });

    if (error) {
      console.error('Failed to send password invalidated email:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send password invalidated email:', error);
    return false;
  }
}
