/**
 * 興味なし映画関連のバリデーションスキーマ
 */

import { z } from 'zod';

/**
 * 興味なし映画追加のバリデーションスキーマ
 */
export const dismissedMoviesAddSchema = z.object({
  tmdb_movie_id: z
    .number()
    .int('映画IDは整数で入力してください')
    .positive('映画IDは正の整数で入力してください'),
  title: z
    .string()
    .min(1, '映画タイトルを入力してください')
    .max(255, '映画タイトルは255文字以内で入力してください'),
  genre_ids: z.array(z.number().int()).nullable().optional(),
});
