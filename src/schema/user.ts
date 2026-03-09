/**
 * ユーザー設定関連のバリデーションスキーマ
 */

import { z } from 'zod';

/**
 * テーマの選択肢
 */
export const THEME_VALUES = ['light', 'dark'] as const;

/**
 * 表示名更新のバリデーションスキーマ
 */
export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(1, '表示名を入力してください')
    .max(100, '表示名は100文字以内で入力してください')
    .regex(/\S/, '空白のみの表示名は使用できません'),
});

/**
 * 表示名更新フォームの型
 */
export type UpdateProfileFormData = z.infer<typeof updateProfileSchema>;

/**
 * ユーザー設定更新のバリデーションスキーマ
 */
export const updateSettingsSchema = z.object({
  theme: z.enum(THEME_VALUES).optional(),
  notificationEnabled: z.boolean().optional(),
});

/**
 * ユーザー設定更新の型
 */
export type UpdateSettingsFormData = z.infer<typeof updateSettingsSchema>;

/**
 * ユーザー設定のレスポンス型
 */
export interface UserSettings {
  theme: (typeof THEME_VALUES)[number];
  notificationEnabled: boolean;
}
