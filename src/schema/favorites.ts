/**
 * お気に入り関連のバリデーションスキーマ
 */

import { z } from 'zod';

import {
  FAVORITES_DEFAULT_LIMIT,
  FAVORITES_MAX_LIMIT,
  FAVORITES_RATING_MAX,
  FAVORITES_RATING_MIN,
  FAVORITES_SORT_BY,
  FAVORITES_SORT_ORDER,
} from '@/constants';

/**
 * お気に入り追加のバリデーションスキーマ
 */
export const favoritesAddSchema = z.object({
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
  rating: z
    .number()
    .int('評価は整数で入力してください')
    .min(FAVORITES_RATING_MIN, `評価は${FAVORITES_RATING_MIN}以上で入力してください`)
    .max(FAVORITES_RATING_MAX, `評価は${FAVORITES_RATING_MAX}以下で入力してください`),
});

/**
 * お気に入り追加フォームの型
 */
export type FavoritesAddFormData = z.infer<typeof favoritesAddSchema>;

/**
 * 評価更新のバリデーションスキーマ
 */
export const favoritesUpdateSchema = z.object({
  rating: z
    .number()
    .int('評価は整数で入力してください')
    .min(FAVORITES_RATING_MIN, `評価は${FAVORITES_RATING_MIN}以上で入力してください`)
    .max(FAVORITES_RATING_MAX, `評価は${FAVORITES_RATING_MAX}以下で入力してください`),
});

/**
 * 評価更新フォームの型
 */
export type FavoritesUpdateFormData = z.infer<typeof favoritesUpdateSchema>;

/**
 * お気に入り一覧取得クエリのバリデーションスキーマ
 */
export const favoritesQuerySchema = z.object({
  sort_by: z
    .enum([FAVORITES_SORT_BY.ADDED_AT, FAVORITES_SORT_BY.RATING])
    .default(FAVORITES_SORT_BY.ADDED_AT),
  sort_order: z
    .enum([FAVORITES_SORT_ORDER.ASC, FAVORITES_SORT_ORDER.DESC])
    .default(FAVORITES_SORT_ORDER.DESC),
  page: z.coerce
    .number()
    .int()
    .min(1, 'ページ番号は1以上で指定してください')
    .default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, '取得件数は1以上で指定してください')
    .max(
      FAVORITES_MAX_LIMIT,
      `取得件数は${FAVORITES_MAX_LIMIT}以下で指定してください`,
    )
    .default(FAVORITES_DEFAULT_LIMIT),
});

/**
 * お気に入り一覧取得クエリの型
 */
export type FavoritesQueryParams = z.infer<typeof favoritesQuerySchema>;
