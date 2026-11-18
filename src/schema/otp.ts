/**
 * OTP関連のバリデーションスキーマ
 */

import { z } from 'zod';

import { OTP_ACTION, type OtpAction } from '@/constants/otp';
import { VALIDATION_MESSAGES } from '@/constants/auth';
import { normalizeEmail } from '@/utils/email';

/**
 * 公開ルートが受け付ける OTP の用途
 *
 * ⚠️ **`Object.values(OTP_ACTION)` を使ってはいけない。**
 *
 * 以前はそう書いていたため、`OTP_ACTION` に値を足すと
 * `/api/auth/otp/send` と `/api/auth/otp/verify` が**自動的にそれを受理**した。
 * `send` の action 分岐は宛先をセッションに固定する処理を `password_change` の
 * ときしか行わない（`route.ts` の冒頭）ので、新しい用途は存在チェックも
 * 宛先固定も通らないまま送信へ到達する。第2要素（`two_factor`）を足したときは、
 * **未認証のまま任意のアドレスへ自サービス名義の確認コードを送れる**状態に
 * なるところだった（#641 で塞いだ穴の再発）。
 *
 * ここは「公開してよい用途」を**人が明示する**場所に保つ。新しい用途を
 * 足すときは、未認証で任意の宛先に送られても問題ないかを判断したうえで、
 * このリストに書くこと。認証済みの経路からしか送らないものは
 * （第2要素のように）ここに入れない。
 */
export const PUBLIC_OTP_ACTIONS = [
  OTP_ACTION.REGISTRATION,
  OTP_ACTION.LOGIN,
  OTP_ACTION.PASSWORD_CHANGE,
] as const satisfies readonly OtpAction[];

const otpActionValues = PUBLIC_OTP_ACTIONS as unknown as [
  OtpAction,
  ...OtpAction[],
];

/**
 * 正規化済みメールアドレス
 *
 * 形式検証の後に小文字化する。大小文字違いが別アカウント・別レート制限
 * カウンタになると、表記を変えるだけで送信上限を回避できてしまうため、
 * スキーマの時点で表記を1つに畳む。
 */
const normalizedEmailSchema = z
  .string()
  .trim()
  .min(1, VALIDATION_MESSAGES.EMAIL_REQUIRED)
  .email(VALIDATION_MESSAGES.EMAIL_INVALID)
  .transform(normalizeEmail);

/**
 * OTP送信APIリクエストのバリデーションスキーマ
 */
export const otpSendSchema = z.object({
  email: normalizedEmailSchema,
  action: z.enum(otpActionValues, {
    error: '不正なアクション種別です',
  }),
});

export type OtpSendRequest = z.infer<typeof otpSendSchema>;

/**
 * OTP検証APIリクエストのバリデーションスキーマ
 */
export const otpVerifySchema = z.object({
  email: normalizedEmailSchema,
  code: z
    .string()
    .length(6, '6桁の数字を入力してください')
    .regex(/^[0-9]{6}$/, '数字のみ入力可能です'),
  action: z.enum(otpActionValues, {
    error: '不正なアクション種別です',
  }),
});

export type OtpVerifyRequest = z.infer<typeof otpVerifySchema>;

/**
 * OTPフォーム（クライアント用）のバリデーションスキーマ
 */
export const otpFormSchema = z.object({
  otp: z
    .string()
    .length(6, '6桁の数字を入力してください')
    .regex(/^[0-9]{6}$/, '数字のみ入力可能です'),
});

export type OtpFormData = z.infer<typeof otpFormSchema>;
