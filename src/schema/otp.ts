/**
 * OTP関連のバリデーションスキーマ
 */

import { z } from 'zod';

import { OTP_ACTION, type OtpAction } from '@/constants/otp';
import { VALIDATION_MESSAGES } from '@/constants/auth';

const otpActionValues = Object.values(OTP_ACTION) as [OtpAction, ...OtpAction[]];

/**
 * OTP送信APIリクエストのバリデーションスキーマ
 */
export const otpSendSchema = z.object({
  email: z
    .string()
    .min(1, VALIDATION_MESSAGES.EMAIL_REQUIRED)
    .email(VALIDATION_MESSAGES.EMAIL_INVALID),
  action: z.enum(otpActionValues, {
    error: '不正なアクション種別です',
  }),
});

export type OtpSendRequest = z.infer<typeof otpSendSchema>;

/**
 * OTP検証APIリクエストのバリデーションスキーマ
 */
export const otpVerifySchema = z.object({
  email: z
    .string()
    .min(1, VALIDATION_MESSAGES.EMAIL_REQUIRED)
    .email(VALIDATION_MESSAGES.EMAIL_INVALID),
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
