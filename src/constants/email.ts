/**
 * メール関連の定数
 */

import { APP_NAME } from './app';
import { OTP_ACTION, OTP_CONFIG, type OtpAction } from './otp';

/**
 * デフォルトの送信元メールアドレス（フォールバック）
 */
export const DEFAULT_FROM_EMAIL = 'noreply@example.com';

/**
 * OTPの用途ごとの表示名。
 *
 * 件名・本文に用途を明記するために使う。3用途で文面が同一だと、受信者は
 * 届いたコードが何のためのものか判断できず、「サポートを装って読み上げさせる」
 * 類のソーシャルエンジニアリングに弱くなる（#648）。
 */
const OTP_PURPOSE_LABEL: Record<OtpAction, string> = {
  [OTP_ACTION.REGISTRATION]: 'メールアドレスの確認',
  [OTP_ACTION.LOGIN]: 'ログイン',
  [OTP_ACTION.PASSWORD_CHANGE]: 'パスワード変更',
};

/**
 * OTPメール件名を生成する
 *
 * @param action - OTPの用途
 * @returns 用途を含む件名
 */
export function buildOtpEmailSubject(action: OtpAction): string {
  return `[${APP_NAME}] ${OTP_PURPOSE_LABEL[action]}の確認コード`;
}

/**
 * OTPメール本文を生成する
 *
 * @param code - 6桁の確認コード
 * @param action - OTPの用途
 * @returns 用途の明記と共有禁止の警告を含む本文
 */
export function buildOtpEmailText(code: string, action: OtpAction): string {
  return `${APP_NAME}の確認コードです。
このコードは「${OTP_PURPOSE_LABEL[action]}」のために発行されました。

確認コード: ${code}

このコードは${OTP_CONFIG.EXPIRY_MINUTES}分間有効です。

⚠ このコードを他人に教えないでください。
${APP_NAME}からお客様に確認コードをお尋ねすることはありません。

心当たりがない場合は、このメールを無視してください。
第三者がお客様のメールアドレスを入力した可能性があります。`;
}
