/**
 * メールアドレス変更の通知メール（#1359）
 *
 * ⚠️ **旧アドレスへ送る。** 乗っ取られた利用者が気づける唯一の手段。
 * 新アドレスへ送っても攻撃者に届くだけで意味がない。
 */

import { Resend } from 'resend';

import { APP_NAME } from '@/constants/app';
import { CONTACT_EMAIL, DEFAULT_FROM_EMAIL } from '@/constants/email';
import { EMAIL_CHANGE_MESSAGES } from '@/constants/emailChange';

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL;

/**
 * アドレスが変更されたことを旧アドレスへ知らせる
 *
 * ⚠️ **呼び出し側は戻り値で変更を止めないこと。** 変更は通知より前に
 * 確定しており、ここで失敗しても `users.email` は新しい値になっている。
 * 送信失敗で 500 にすると、正しいコードを入れた利用者が
 * 「失敗した」と思って同じ操作を繰り返す行き止まりを作る
 * （`sendPasswordInvalidatedEmail` と同じ契約）。
 *
 * @param oldEmail - 変更前のアドレス（送信先）
 * @param newEmail - 変更後のアドレス（本文に載せる）
 * @returns 送信できたかどうか
 */
export async function sendEmailChangedNotice(
  oldEmail: string,
  newEmail: string,
): Promise<boolean> {
  // E2E/テスト用バイパス: 実送信をスキップして成功扱いにする。
  //
  // positive guard（fail-closed）: 明示的な E2E_TEST_MODE=true のときのみ許可し、
  // 機能個別の OTP_EMAIL_TEST_BYPASS も要求する。Vercel 本番では VERCEL_ENV で
  // 多層に強制無効化する（sendOtpEmail と同じ条件に揃えてある／#424）。
  if (
    process.env.E2E_TEST_MODE === 'true' &&
    process.env.OTP_EMAIL_TEST_BYPASS === 'true' &&
    process.env.VERCEL_ENV !== 'production'
  ) {
    console.warn(
      '[OTP_EMAIL_TEST_BYPASS] sendEmailChangedNotice はテストモードのため実送信をスキップしました',
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
      to: oldEmail,
      subject: `[${APP_NAME}] ${EMAIL_CHANGE_MESSAGES.NOTICE_SUBJECT}`,
      text: [
        `${APP_NAME}のログインに使うメールアドレスが変更されました。`,
        '',
        `変更前: ${oldEmail}`,
        `変更後: ${newEmail}`,
        '',
        'この操作に心当たりがない場合、アカウントが第三者に使われた可能性があります。',
        // ⚠️ 旧アドレスではもうログインできない。「ログインして確認してください」
        //   とは書けないので、窓口へ誘導する。宛先を書かずに「窓口へご連絡
        //   ください」とだけ書くと辿り着けない（#1315）
        'ご自身でログインできない状態になっているため、下記までご連絡ください。',
        `  ${CONTACT_EMAIL}`,
        '',
        `⚠ ${APP_NAME}からお客様にパスワードをお尋ねすることはありません。`,
      ].join('\n'),
    });

    if (error) {
      console.error('Failed to send email changed notice:', error);

      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send email changed notice:', error);

    return false;
  }
}
