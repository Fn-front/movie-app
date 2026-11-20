/**
 * メール関連の定数
 */

import { APP_NAME } from './app';
import { OTP_ACTION, OTP_CONFIG, type OtpAction } from './otp';
import { TWO_FACTOR_OTP_ACTION, type TwoFactorOtpAction } from './secondFactor';
import {
  EMAIL_CHANGE_OTP_ACTION,
  type EmailChangeOtpAction,
} from './emailChange';

/**
 * 確認コードメールに書く用途の種別
 *
 * 公開ルートが受け付ける `OtpAction` に、第2要素（公開ルートからは到達しない）
 * を足したもの。`OTP_ACTION` 自体を広げてはいけない理由は
 * `secondFactor.ts` の `TWO_FACTOR_OTP_ACTION` を参照。
 */
export type OtpEmailAction =
  | OtpAction
  | TwoFactorOtpAction
  | EmailChangeOtpAction;

/**
 * デフォルトの送信元メールアドレス（フォールバック）
 */
export const DEFAULT_FROM_EMAIL = 'noreply@example.com';

/**
 * 問い合わせ窓口
 *
 * ⚠️ **本文に「窓口へご連絡ください」と書くなら必ず載せる。**
 * 宛先を書かずに案内だけすると、受け取った人は辿り着けない
 * （#1315 で直した「窓口が届かない」と同系統）。
 */
export const CONTACT_EMAIL = 'support@movie-app-fn.com';

/**
 * OTPの用途ごとの表示名。
 *
 * 件名・本文に用途を明記するために使う。3用途で文面が同一だと、受信者は
 * 届いたコードが何のためのものか判断できず、「サポートを装って読み上げさせる」
 * 類のソーシャルエンジニアリングに弱くなる（#648）。
 */
const OTP_PURPOSE_LABEL: Record<OtpEmailAction, string> = {
  [OTP_ACTION.REGISTRATION]: 'メールアドレスの確認',
  [OTP_ACTION.LOGIN]: 'ログイン',
  [OTP_ACTION.PASSWORD_CHANGE]: 'パスワード変更',
  // 「ログイン」とは分ける。第2要素のコードは**パスワードが破られたときだけ**
  // 届くので、利用者が「自分で始めていないログイン」と区別できないと、
  // 侵害に気づく唯一の機会を失う
  [TWO_FACTOR_OTP_ACTION]: '二段階認証',
  // ⚠️ 宛先は**まだ本人のものでないアドレス**。受け取った人が
  //   「身に覚えがない」と分かる文言にする（#1359）
  [EMAIL_CHANGE_OTP_ACTION]: 'メールアドレスの変更',
};

/**
 * OTPメール件名を生成する
 *
 * @param action - OTPの用途
 * @returns 用途を含む件名
 */
export function buildOtpEmailSubject(action: OtpEmailAction): string {
  return `[${APP_NAME}] ${OTP_PURPOSE_LABEL[action]}の確認コード`;
}

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

/**
 * パスワード失効通知メールの件名
 */
export function buildPasswordInvalidatedEmailSubject(): string {
  return `[${APP_NAME}] パスワードを無効にしました`;
}

/**
 * パスワード失効通知メール本文を生成する
 *
 * 未検証のまま放置されたアカウントが「メールでログイン」で認証済みへ
 * 昇格したときに送る（#1302）。未検証の間に設定されたパスワードは、
 * `register` が未検証ユーザーの `password_hash` を無条件で上書きする
 * 仕様（#645）のせいで**本人が設定したものとは限らない**ため、昇格と
 * 同時に失効させている。
 *
 * 失効させたこと自体を伝えないと、利用者は次のパスワードログインが
 * 「メールアドレスまたはパスワードが正しくありません。」で弾かれる
 * 理由を知るすべがない。
 *
 * @param settingsUrl - パスワードを設定し直す設定ページのURL
 * @returns 失効の事実と再設定の案内を含む本文
 */
export function buildPasswordInvalidatedEmailText(settingsUrl: string): string {
  return `${APP_NAME}のメールアドレス確認が完了しました。

あわせて、このアカウントに設定されていたパスワードを無効にしました。
メールアドレスの確認が済む前に設定されたパスワードは、第三者が設定したもので
ある可能性を否定できないためです。

パスワードは以下のページから設定し直せます。
設定するまでの間も「メールでログイン」はこれまでどおりご利用いただけます。

${settingsUrl}

⚠ ${APP_NAME}からお客様にパスワードをお尋ねすることはありません。

心当たりがない場合は、お客様宛の確認コードが第三者に使われた可能性があります。
メールアカウントの安全性をご確認のうえ、上記のページからパスワードを設定して
ください。`;
}

/**
 * OTPメール本文を生成する
 *
 * @param code - 6桁の確認コード
 * @param action - OTPの用途
 * @returns 用途の明記と共有禁止の警告を含む本文
 */
export function buildOtpEmailText(
  code: string,
  action: OtpEmailAction,
): string {
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
