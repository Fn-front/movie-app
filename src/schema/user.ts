/**
 * ユーザー設定関連のバリデーションスキーマ
 */

import { z } from 'zod';

/**
 * テーマの選択肢
 * `system` は OS 設定（prefers-color-scheme）に追従する未設定既定値。
 * 切り替えUI（スイッチ/RadioGroup）はライト/ダークの2択で、明示操作時は
 * light/dark を保存する。system は主に未設定ユーザーの既定として使う。
 */
export const THEME_VALUES = ['light', 'dark', 'system'] as const;

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
