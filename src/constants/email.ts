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
/**
 * パスワードリセットメールの件名
 */
export function buildPasswordResetEmailSubject(): string {
  return `[${APP_NAME}] パスワード再設定のご案内`;
}

/**
 * パスワードリセットメール本文を生成する
 *
 * リンクの有効期限と、心当たりがない場合の案内を必ず入れる。
 * 第三者がメールアドレスを入力しただけでも届くため。
 *
 * @param resetUrl - トークン付きの再設定URL
 * @param expiryMinutes - リンクの有効期限（分）
 * @returns メール本文
 */
export function buildPasswordResetEmailText(
  resetUrl: string,
  expiryMinutes: number,
): string {
  return `${APP_NAME}のパスワード再設定のご案内です。

以下のリンクから新しいパスワードを設定してください。

${resetUrl}

このリンクは${expiryMinutes}分間有効で、1回のみ使用できます。

⚠ このリンクを他人に教えないでください。
${APP_NAME}からお客様にこのリンクをお尋ねすることはありません。

心当たりがない場合は、このメールを無視してください。
パスワードは変更されません。第三者がお客様のメールアドレスを入力した可能性があります。`;
}

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

/**
 * 管理者発行アカウントの案内メールの件名
 *
 * @param isReissue - 再発行かどうか
 */
export function buildAdminAccountEmailSubject(isReissue: boolean): string {
  return isReissue
    ? `[${APP_NAME}] パスワード設定リンクの再送`
    : `[${APP_NAME}] アカウント発行のご案内`;
}

/**
 * 管理者発行アカウントの案内メール本文を生成する
 *
 * **パスワードは載せない。** 載せると Resend のダッシュボードと受信箱に
 * 有効な認証情報が残り続け、失効もできない。期限付き・1回限りのリンクを
 * 渡し、本人にパスワードを決めてもらう。
 *
 * アカウント名は載せる。これが無いと受信者はログインできない。
 *
 * @param username - ログインに使うアカウント名
 * @param setupUrl - トークン付きのパスワード設定URL
 * @param expiryMinutes - リンクの有効期限（分）
 * @param isReissue - 再発行かどうか
 * @returns メール本文
 */
export function buildAdminAccountEmailText(
  username: string,
  setupUrl: string,
  expiryMinutes: number,
  isReissue: boolean,
): string {
  const hours = Math.round(expiryMinutes / 60);
  const expiryLabel =
    expiryMinutes >= 60 ? `${hours}時間` : `${expiryMinutes}分`;

  const intro = isReissue
    ? `${APP_NAME}のパスワード設定リンクを再送します。`
    : `${APP_NAME}のアカウントを発行しました。`;

  return `${intro}

アカウント名: ${username}

以下のリンクからパスワードを設定してください。

${setupUrl}

このリンクは${expiryLabel}有効で、1回のみ使用できます。
期限が切れた場合は、発行を依頼した担当者にご連絡ください。

ログインするときは、上記のアカウント名と設定したパスワードを使います。
（このアカウントにメールアドレスは登録されていません）

⚠ このリンクとアカウント名を他人に教えないでください。
${APP_NAME}からお客様にこれらをお尋ねすることはありません。

心当たりがない場合は、このメールを無視してください。`;
}
