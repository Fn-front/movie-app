/**
 * 認証関連のバリデーションスキーマ
 */

import { z } from 'zod';

import { VALIDATION } from '@/constants';
import { VALIDATION_MESSAGES } from '@/constants/auth';

import { normalizeEmail } from '@/utils/email';

/**
 * 正規化済みメールアドレス
 *
 * 形式検証の後に小文字化する。大小文字違いが別アカウント・別レート制限
 * カウンタになると、表記を変えるだけで登録上限・送信上限を回避できてしまう
 * ため、スキーマの時点で表記を1つに畳む。
 */
const normalizedEmailSchema = z
  .string()
  .trim()
  .min(1, VALIDATION_MESSAGES.EMAIL_REQUIRED)
  .max(VALIDATION.EMAIL_MAX_LENGTH, VALIDATION_MESSAGES.EMAIL_TOO_LONG)
  .email(VALIDATION_MESSAGES.EMAIL_INVALID)
  .transform(normalizeEmail);

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
    email: normalizedEmailSchema,
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
  email: normalizedEmailSchema,
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
  email: normalizedEmailSchema,
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
  email: normalizedEmailSchema,
});

/**
 * OTPログイン用メールアドレスの型
 */
export type OtpLoginEmailFormData = z.infer<typeof otpLoginEmailSchema>;

/**
 * パスワード変更フォームのバリデーションスキーマを生成する
 *
 * @param requireCurrentPassword - 現在のパスワードを要求するか。
 *   ソーシャルログインのみで登録しパスワード未設定のユーザー（`password_hash`
 *   が null）は入力しようがないため false にする
 */
export function buildChangePasswordSchema(requireCurrentPassword: boolean) {
  return z
    .object({
      currentPassword: requireCurrentPassword
        ? z.string().min(1, VALIDATION_MESSAGES.CURRENT_PASSWORD_REQUIRED)
        : z.string().optional(),
      newPassword: passwordSchema,
      confirmNewPassword: z
        .string()
        .min(1, VALIDATION_MESSAGES.CONFIRM_PASSWORD_REQUIRED),
    })
    .refine((data) => data.newPassword === data.confirmNewPassword, {
      message: VALIDATION_MESSAGES.PASSWORD_MISMATCH,
      path: ['confirmNewPassword'],
    });
}

/**
 * パスワード変更フォームのバリデーションスキーマ（現在のパスワード必須）
 */
export const changePasswordSchema = buildChangePasswordSchema(true);

/**
 * パスワード変更フォームの型
 */
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

/**
 * パスワード変更APIリクエストのバリデーションスキーマ（OTP検証後）
 *
 * `verificationToken` は `/api/auth/otp/verify` が検証成功時に返すワンタイムトークン。
 * これを本人確認の根拠にすることで、「検証済みの行がDBに存在する」だけで通る
 * 状態（メールアドレスを知る第三者が成り代わりうる）を防ぐ。
 */
export const changePasswordApiSchema = z.object({
  newPassword: passwordSchema,
  verificationToken: z.string().min(1, VALIDATION_MESSAGES.OTP_TOKEN_REQUIRED),
  /**
   * 現在のパスワード。
   *
   * スキーマ上は任意だが、`users.password_hash` が設定されているユーザーには
   * ルート側で必須として検証する。パスワード未設定（ソーシャルログインのみ）の
   * ユーザーは入力しようがないため、ここで一律必須にはできない。
   */
  currentPassword: z.string().optional(),
});

/**
 * パスワードリセット発行リクエストのバリデーションスキーマ
 */
export const passwordResetRequestSchema = z.object({
  // 表記ゆれが別アカウント・別レート制限カウンタになるのを防ぐため、
  // スキーマの時点で畳む
  email: normalizedEmailSchema,
});

/**
 * パスワードリセット発行フォームの型
 */
export type PasswordResetRequestFormData = z.infer<
  typeof passwordResetRequestSchema
>;

/**
 * パスワード再設定フォームのバリデーションスキーマ
 */
export const passwordResetConfirmSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z
      .string()
      .min(1, VALIDATION_MESSAGES.CONFIRM_PASSWORD_REQUIRED),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: VALIDATION_MESSAGES.PASSWORD_MISMATCH,
    path: ['confirmPassword'],
  });

/**
 * パスワード再設定フォームの型
 */
export type PasswordResetConfirmFormData = z.infer<
  typeof passwordResetConfirmSchema
>;

/**
 * パスワード再設定APIリクエストのバリデーションスキーマ
 *
 * トークンはメールのリンクに載っていた平文。サーバー側でハッシュ化して照合する。
 */
export const passwordResetConfirmApiSchema = z.object({
  token: z.string().min(1, VALIDATION_MESSAGES.OTP_TOKEN_REQUIRED),
  password: passwordSchema,
});
