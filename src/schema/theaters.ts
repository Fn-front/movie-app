/**
 * 劇場関連のバリデーションスキーマ
 */

import { z } from 'zod';

/**
 * 劇場slug バリデーション
 * URL用識別子: 小文字英数字とハイフンのみ
 */
export const theaterSlugSchema = z
  .string()
  .min(1, 'slugは必須です')
  .max(100, 'slugは100文字以内で入力してください')
  .regex(/^[a-z0-9-]+$/, 'slugは小文字英数字とハイフンのみ使用できます');
