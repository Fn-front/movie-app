/**
 * 認証関連のバリデーションスキーマ
 */

import { z } from 'zod';

import { VALIDATION } from '@/constants';
import { VALIDATION_MESSAGES } from '@/constants/auth';

/**
 * パスワードバリデーション（ポリシー付き）
 * - 8文字以上
 * - 大文字を含む
 * - 小文字を含む
 * - 数字を含む
 */
const passwordSchema = z
  .string()
  .min(
    VALIDATION.PASSWORD_MIN_LENGTH,
    VALIDATION_MESSAGES.PASSWORD_MIN_LENGTH(VALIDATION.PASSWORD_MIN_LENGTH),
  )
  .regex(/[A-Z]/, VALIDATION_MESSAGES.PASSWORD_UPPERCASE)
  .regex(/[a-z]/, VALIDATION_MESSAGES.PASSWORD_LOWERCASE)
  .regex(/[0-9]/, VALIDATION_MESSAGES.PASSWORD_NUMBER);

/**
 * 新規登録フォームのバリデーションスキーマ
 */
export const registerSchema = z
  .object({
    email: z
      .string()
      .min(1, VALIDATION_MESSAGES.EMAIL_REQUIRED)
      .max(VALIDATION.EMAIL_MAX_LENGTH, VALIDATION_MESSAGES.EMAIL_TOO_LONG)
      .email(VALIDATION_MESSAGES.EMAIL_INVALID),
    password: passwordSchema,
    confirmPassword: z
      .string()
      .min(1, VALIDATION_MESSAGES.CONFIRM_PASSWORD_REQUIRED),
    name: z
      .string()
      .max(100, VALIDATION_MESSAGES.NAME_TOO_LONG)
      .optional()
      .or(z.literal('')),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: VALIDATION_MESSAGES.PASSWORD_MISMATCH,
    path: ['confirmPassword'],
  });

/**
 * 新規登録フォームの型
 */
export type RegisterFormData = z.infer<typeof registerSchema>;

/**
 * ログインフォームのバリデーションスキーマ
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, VALIDATION_MESSAGES.EMAIL_REQUIRED)
    .email(VALIDATION_MESSAGES.EMAIL_INVALID),
  password: z.string().min(1, VALIDATION_MESSAGES.PASSWORD_REQUIRED),
});

/**
 * ログインフォームの型
 */
export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * 登録APIリクエストのバリデーションスキーマ
 */
export const registerApiSchema = z.object({
  email: z
    .string()
    .min(1, VALIDATION_MESSAGES.EMAIL_REQUIRED)
    .max(VALIDATION.EMAIL_MAX_LENGTH, VALIDATION_MESSAGES.EMAIL_TOO_LONG)
    .email(VALIDATION_MESSAGES.EMAIL_INVALID),
  password: passwordSchema,
  name: z
    .string()
    .max(100, VALIDATION_MESSAGES.NAME_TOO_LONG)
    .optional()
    .or(z.literal('')),
});

/**
 * OTPログイン用メールアドレスのバリデーションスキーマ
 */
export const otpLoginEmailSchema = z.object({
  email: z
    .string()
    .min(1, VALIDATION_MESSAGES.EMAIL_REQUIRED)
    .email(VALIDATION_MESSAGES.EMAIL_INVALID),
});

/**
 * OTPログイン用メールアドレスの型
 */
export type OtpLoginEmailFormData = z.infer<typeof otpLoginEmailSchema>;

/**
 * パスワード変更フォームのバリデーションスキーマ
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, VALIDATION_MESSAGES.PASSWORD_REQUIRED),
    newPassword: passwordSchema,
    confirmNewPassword: z
      .string()
      .min(1, VALIDATION_MESSAGES.CONFIRM_PASSWORD_REQUIRED),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: VALIDATION_MESSAGES.PASSWORD_MISMATCH,
    path: ['confirmNewPassword'],
  });

/**
 * パスワード変更フォームの型
 */
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

/**
 * パスワード変更APIリクエストのバリデーションスキーマ
 */
export const changePasswordApiSchema = z.object({
  currentPassword: z.string().min(1, VALIDATION_MESSAGES.PASSWORD_REQUIRED),
  newPassword: passwordSchema,
});
