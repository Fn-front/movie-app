/**
 * 認証関連のバリデーションスキーマ
 */

import { z } from 'zod';

import { VALIDATION } from '@/constants';

/**
 * パスワードバリデーション
 * - 8文字以上
 * - 大文字を含む
 * - 小文字を含む
 * - 数字を含む
 */
const passwordSchema = z
  .string()
  .min(
    VALIDATION.PASSWORD_MIN_LENGTH,
    `パスワードは${VALIDATION.PASSWORD_MIN_LENGTH}文字以上で入力してください`,
  )
  .regex(/[A-Z]/, 'パスワードに大文字を含めてください')
  .regex(/[a-z]/, 'パスワードに小文字を含めてください')
  .regex(/[0-9]/, 'パスワードに数字を含めてください');

/**
 * 新規登録フォームのバリデーションスキーマ
 */
export const registerSchema = z
  .object({
    email: z
      .string()
      .min(1, 'メールアドレスを入力してください')
      .max(VALIDATION.EMAIL_MAX_LENGTH, 'メールアドレスが長すぎます')
      .email('メールアドレスの形式が正しくありません'),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'パスワード（確認）を入力してください'),
    name: z
      .string()
      .max(100, 'ユーザー名は100文字以内で入力してください')
      .optional()
      .or(z.literal('')),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'パスワードが一致しません',
    path: ['confirmPassword'],
  });

/**
 * 新規登録フォームの型
 */
export type RegisterFormData = z.infer<typeof registerSchema>;

/**
 * 登録APIリクエストのバリデーションスキーマ
 */
export const registerApiSchema = z.object({
  email: z
    .string()
    .min(1, 'メールアドレスを入力してください')
    .max(VALIDATION.EMAIL_MAX_LENGTH, 'メールアドレスが長すぎます')
    .email('メールアドレスの形式が正しくありません'),
  password: passwordSchema,
  name: z
    .string()
    .max(100, 'ユーザー名は100文字以内で入力してください')
    .optional()
    .or(z.literal('')),
});
