/**
 * 二段階認証のバリデーションスキーマ
 */

import { z } from 'zod';

import { TOTP_CONFIG } from '@/constants/totp';

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
 * 有効化（初回コードの検証）
 *
 * 有効化だけは認証アプリのコードに限る。リカバリーコードはまだ発行されていない。
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

export type TotpEnableFormData = z.infer<typeof totpEnableSchema>;
export type TotpVerifyFormData = z.infer<typeof totpVerifySchema>;
