/**
 * フィルター条件のバリデーションスキーマ
 */

import { z } from 'zod';

/**
 * フィルター条件のバリデーションスキーマ
 */
export const filterConditionsSchema = z.object({
  sort_by: z.enum(['release_date', 'popularity', 'vote_average']).optional(),
  release_type: z.enum(['theatrical', 'streaming']).optional(),
  genre_ids: z.array(z.number().int().positive()).optional(),
  date_range_gte: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日付はYYYY-MM-DD形式で指定してください')
    .optional(),
  date_range_lte: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日付はYYYY-MM-DD形式で指定してください')
    .optional(),
  is_revival: z.boolean().optional(),
});

/**
 * フィルター条件の型
 */
export type FilterConditions = z.infer<typeof filterConditionsSchema>;
