/**
 * 二段階認証のバリデーションスキーマ
 */

import { z } from 'zod';

import { TOTP_CONFIG } from '@/constants/totp';
import { SECOND_FACTOR_METHOD } from '@/constants/secondFactor';

/**
 * 認証コード（認証アプリの6桁、またはリカバリーコード）
 *
 * 形式でどちらかを判別するのはサーバー側（`verifySecondFactor`）なので、
 * ここでは「空でない、常識的な長さ」までしか見ない。厳しくしすぎると
 * リカバリーコードの表記ゆれ（ハイフン有無・大文字小文字）を弾いてしまう。
 */
const secondFactorCodeSchema = z
  .string()
  .trim()
  .min(1, '認証コードを入力してください')
  .max(32, '認証コードの形式が正しくありません');

/**
 * 設定開始（方式の選択）
 */
export const secondFactorSetupSchema = z.object({
  method: z.enum([SECOND_FACTOR_METHOD.TOTP, SECOND_FACTOR_METHOD.EMAIL_OTP], {
    error: '不正な方式です',
  }),
});

/**
 * 有効化（初回コードの検証）
 *
 * 有効化は方式のコード（認証アプリの6桁 / メールで届いた6桁）に限る。
 * リカバリーコードはまだ発行されていない。どちらの方式でも6桁の数字なので
 * 同じ形式でよい。
 */
export const totpEnableSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(
      new RegExp(`^\\d{${TOTP_CONFIG.DIGITS}}$`),
      `${TOTP_CONFIG.DIGITS}桁の数字を入力してください`,
    ),
});

/**
 * 無効化・リカバリーコード再発行
 *
 * どちらも所持の証明を要求する。セッションを奪われただけで第2要素を
 * 外せたら二段階認証の意味がない。
 */
export const totpVerifySchema = z.object({
  code: secondFactorCodeSchema,
});

export type SecondFactorSetupData = z.infer<typeof secondFactorSetupSchema>;
export type TotpEnableFormData = z.infer<typeof totpEnableSchema>;
export type TotpVerifyFormData = z.infer<typeof totpVerifySchema>;
