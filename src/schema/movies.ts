/**
 * 映画関連のバリデーションスキーマ
 */

import { z } from 'zod';

import { PAGINATION } from '@/constants';

/**
 * 映画一覧クエリパラメータのバリデーションスキーマ
 */
export const moviesQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.MAX_PAGE)
    .default(PAGINATION.DEFAULT_PAGE),
  sort_by: z
    .enum(['release_date', 'popularity', 'vote_average'])
    .default('release_date'),
});

/**
 * 映画一覧クエリパラメータの型
 */
export type MoviesQueryParams = z.infer<typeof moviesQuerySchema>;
