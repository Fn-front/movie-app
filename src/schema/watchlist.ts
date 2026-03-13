/**
 * ウォッチリスト関連のバリデーションスキーマ
 */

import { z } from 'zod';

import { WATCHLIST_DEFAULT_LIMIT, WATCHLIST_MAX_LIMIT } from '@/constants';

/**
 * ウォッチリスト追加のバリデーションスキーマ
 */
export const watchlistAddSchema = z.object({
  tmdb_movie_id: z
    .number()
    .int('映画IDは整数で入力してください')
    .positive('映画IDは正の整数で入力してください'),
  title: z
    .string()
    .min(1, '映画タイトルを入力してください')
    .max(255, '映画タイトルは255文字以内で入力してください'),
  poster_path: z.string().max(255).nullable().optional(),
  release_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日付はYYYY-MM-DD形式で入力してください')
    .nullable()
    .optional(),
});

/**
 * ウォッチリスト追加フォームの型
 */
export type WatchlistAddFormData = z.infer<typeof watchlistAddSchema>;

/**
 * ウォッチリストソート方式
 */
export const WATCHLIST_SORT_OPTIONS = ['added_at', 'release_date_proximity'] as const;
export type WatchlistSortOption = (typeof WATCHLIST_SORT_OPTIONS)[number];

/**
 * ウォッチリスト一覧取得クエリのバリデーションスキーマ
 */
export const watchlistQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, '取得件数は1以上で指定してください')
    .max(
      WATCHLIST_MAX_LIMIT,
      `取得件数は${WATCHLIST_MAX_LIMIT}以下で指定してください`,
    )
    .default(WATCHLIST_DEFAULT_LIMIT),
  sort: z
    .enum(WATCHLIST_SORT_OPTIONS, {
      error: `ソートはいずれかで指定してください: ${WATCHLIST_SORT_OPTIONS.join(', ')}`,
    })
    .default('added_at'),
});

/**
 * ウォッチリスト一覧取得クエリの型
 */
export type WatchlistQueryParams = z.infer<typeof watchlistQuerySchema>;
