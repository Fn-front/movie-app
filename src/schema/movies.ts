/**
 * 映画関連のバリデーションスキーマ
 */

import { z } from 'zod';

import { PAGINATION, SEARCH_VALIDATION } from '@/constants';

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
  sort_order: z.enum(['asc', 'desc']).optional(),
  release_type: z.enum(['theatrical', 'streaming']).default('theatrical'),
  time_frame: z.enum(['upcoming', 'now_showing']).default('upcoming'),
  // 検索API（schema/search.ts の genre）と同じ regex で検証し、
  // 数値配列に変換する。呼び出し側での再フィルタを不要にするため
  genre_ids: z
    .string()
    .regex(
      /^\d+(,\d+)*$/,
      'ジャンルIDはカンマ区切りの正の整数で指定してください',
    )
    .transform((val) => val.split(',').map(Number))
    .refine((ids) => ids.length <= SEARCH_VALIDATION.MAX_GENRE_IDS, {
      message: `ジャンルIDは${SEARCH_VALIDATION.MAX_GENRE_IDS}件以内で指定してください`,
    })
    .optional(),
  release_date_gte: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日付はYYYY-MM-DD形式で指定してください')
    .optional(),
  release_date_lte: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日付はYYYY-MM-DD形式で指定してください')
    .optional(),
  is_revival: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
});

/**
 * 映画一覧クエリパラメータの型
 */
export type MoviesQueryParams = z.infer<typeof moviesQuerySchema>;
