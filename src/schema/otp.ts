/**
 * OTP関連のバリデーションスキーマ
 */

import { z } from 'zod';

import { OTP_ACTION, type OtpAction } from '@/constants/otp';
import { VALIDATION_MESSAGES } from '@/constants/auth';
import { normalizeEmail } from '@/utils/email';

const otpActionValues = Object.values(OTP_ACTION) as [
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
