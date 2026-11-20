/**
 * 二段階認証を有効にしたことの通知（#1368）
 *
 * ⛔ **身に覚えのない登録に気づける唯一の手段。**
 *
 * 第2要素が登録されると、以降のログインにそのコードが要る。攻撃者が
 * 登録した場合、被害者は**自分が設定していない第2要素**を求められ、
 * リカバリーコードも持っていない。しかも被害者が後からパスワードを
 * 変えても攻撃者の第2要素は残る。
 *
 * 再認証（`requireReauth`）で登録そのものは塞いだが、**通知が無いと
 * 塞ぎ漏れがあったときに誰も気づけない**。
 *
 * ⚠️ **呼び出し側は戻り値で有効化を止めないこと。** 有効化はもう確定して
 * おり、ここで 500 にすると**リカバリーコードを一度も表示できない**まま
 * 終わる（平文はこの応答にしか出ない）。
 */

import { Resend } from 'resend';

import { APP_NAME } from '@/constants/app';
import { CONTACT_EMAIL, DEFAULT_FROM_EMAIL } from '@/constants/email';
import {
  SECOND_FACTOR_METHOD,
  type SecondFactorMethod,
} from '@/constants/secondFactor';

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL;

/** 方式の表示名 */
const METHOD_LABEL: Record<SecondFactorMethod, string> = {
  [SECOND_FACTOR_METHOD.TOTP]: '認証アプリ',
  [SECOND_FACTOR_METHOD.EMAIL_OTP]: 'メール',
};

/**
 * 二段階認証を有効にしたことを登録アドレスへ知らせる
 *
 * @param email - 登録アドレス
 * @param method - 設定された方式
 * @returns 送信できたかどうか
 */
export async function sendSecondFactorEnabledNotice(
  email: string,
  method: SecondFactorMethod,
): Promise<boolean> {
  // E2E/テスト用バイパス: 実送信をスキップして成功扱いにする。
  //
  // positive guard（fail-closed）: 明示的な E2E_TEST_MODE=true のときのみ許可し、
  // 機能個別の OTP_EMAIL_TEST_BYPASS も要求する。Vercel 本番では VERCEL_ENV で
  // 多層に強制無効化する（`sendOtpEmail` と同じ条件／#424）。
  if (
    process.env.E2E_TEST_MODE === 'true' &&
    process.env.OTP_EMAIL_TEST_BYPASS === 'true' &&
    process.env.VERCEL_ENV !== 'production'
  ) {
    console.warn(
      '[OTP_EMAIL_TEST_BYPASS] sendSecondFactorEnabledNotice はテストモードのため実送信をスキップしました',
    );
    return true;
  }

  if (!resendApiKey) {
    console.error('RESEND_API_KEY is not configured');
    return false;
  }

  // ⚠️ **ここから下は try の中に閉じる。** この関数は throw しない契約で、
  // 呼び出し側は戻り値を見ずに先へ進む
  try {
    const resend = new Resend(resendApiKey);

    const { error } = await resend.emails.send({
      from: `${APP_NAME} <${fromEmail}>`,
      to: email,
      subject: `[${APP_NAME}] 二段階認証を有効にしました`,
      text: [
        `${APP_NAME}の二段階認証を有効にしました。`,
        '',
        `方式: ${METHOD_LABEL[method]}`,
        '',
        '以降のログインでは、パスワードに加えてこの方式のコードが必要になります。',
        '',
        'この操作に心当たりがない場合、アカウントが第三者に使われた可能性があります。',
        // ⚠️ 第2要素を登録されると、本人はログインできてもコードを出せない。
        //   「ログインして設定を見てください」では解決しないので窓口へ誘導する
        'ご自身で設定を解除できない場合は、下記までご連絡ください。',
        `  ${CONTACT_EMAIL}`,
        '',
        `⚠ ${APP_NAME}からお客様に確認コードやリカバリーコードをお尋ねすることはありません。`,
      ].join('\n'),
    });

    if (error) {
      console.error('Failed to send second factor enabled notice:', error);

      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send second factor enabled notice:', error);

    return false;
  }
}
