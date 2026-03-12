/**
 * 検索関連のバリデーションスキーマ
 */

import { z } from 'zod';

import { PAGINATION } from '@/constants';
import { SEARCH_VALIDATION } from '@/constants/search';

/**
 * 検索クエリパラメータのバリデーションスキーマ
 */
export const searchQuerySchema = z
  .object({
    query: z.string().trim().min(1).optional(),
    page: z.coerce
      .number()
      .int()
      .min(1)
      .max(PAGINATION.MAX_PAGE)
      .default(PAGINATION.DEFAULT_PAGE),
    genre: z
      .string()
      .regex(
        /^\d+(,\d+)*$/,
        'ジャンルIDはカンマ区切りの正の整数で指定してください',
      )
      .optional(),
    year: z.coerce
      .number()
      .int()
      .min(SEARCH_VALIDATION.YEAR_MIN)
      .max(new Date().getFullYear() + 5)
      .optional(),
    vote_average_gte: z.coerce
      .number()
      .min(SEARCH_VALIDATION.VOTE_AVERAGE_MIN)
      .max(SEARCH_VALIDATION.VOTE_AVERAGE_MAX)
      .optional(),
  })
  .refine(
    (data) =>
      data.query || data.genre || data.year !== undefined || data.vote_average_gte !== undefined,
    {
      message: '検索キーワードまたはフィルター条件を指定してください',
    },
  );

/**
 * 検索クエリパラメータの型
 */
export type SearchQueryParams = z.infer<typeof searchQuerySchema>;
