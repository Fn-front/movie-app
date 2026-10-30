/**
 * 管理者発行アカウントのバリデーションスキーマ
 *
 * 設計: `.claude/documents/admin-account-design.md`
 */

import { z } from 'zod';

import { VALIDATION } from '@/constants';
import { VALIDATION_MESSAGES } from '@/constants/auth';
import { normalizeEmail } from '@/utils/email';

/**
 * 送信先メールアドレス。
 *
 * **DBには保存しない。** 配送路としてのみ使う値だが、入力ミスで赤の他人へ
 * アカウントを渡さないよう形式は検証する。
 */
const deliveryEmailSchema = z
  .string()
  .trim()
  .min(1, VALIDATION_MESSAGES.EMAIL_REQUIRED)
  .max(VALIDATION.EMAIL_MAX_LENGTH, VALIDATION_MESSAGES.EMAIL_TOO_LONG)
  .email(VALIDATION_MESSAGES.EMAIL_INVALID)
  .transform(normalizeEmail);

/**
 * アカウント発行リクエスト
 */
export const adminAccountCreateSchema = z.object({
  email: deliveryEmailSchema,
});

export type AdminAccountCreateInput = z.infer<typeof adminAccountCreateSchema>;

/**
 * 設定リンクの再発行リクエスト
 *
 * 対象アカウントは URL のパスで受けるため、ここには含めない。
 */
export const adminAccountReissueSchema = z.object({
  email: deliveryEmailSchema,
});

export type AdminAccountReissueInput = z.infer<
  typeof adminAccountReissueSchema
>;
