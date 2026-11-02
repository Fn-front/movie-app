/**
 * ウォッチリスト関連のバリデーションスキーマ
 */

import { z } from 'zod';

import {
  WATCHLIST_BULK_DELETE_MAX_EXCLUDE_IDS,
  WATCHLIST_CLEANUP_MAX_YEAR,
  WATCHLIST_CLEANUP_MIN_YEAR,
  WATCHLIST_DEFAULT_LIMIT,
  WATCHLIST_MAX_LIMIT,
} from '@/constants';

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
 * 視聴済み更新のバリデーションスキーマ
 */
export const watchlistWatchedSchema = z.object({
  watched: z.boolean({ error: '視聴済みは真偽値で指定してください' }),
});

/**
 * 視聴済み更新フォームの型
 */
export type WatchlistWatchedFormData = z.infer<typeof watchlistWatchedSchema>;

/**
 * ウォッチリストソート方式
 */
export const WATCHLIST_SORT_OPTIONS = [
  'added_at',
  'release_date_proximity',
] as const;
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
  /**
   * 視聴済みを除外するか。サイドバー（公開日が近い映画）で使う。
   * クライアント側で弾くと上位N件の枠が視聴済みで埋まって表示件数が減るため、
   * 取得の段階で落とす。
   */
  exclude_watched: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /**
   * 配信中の未視聴を先頭に出すか。
   *
   * サイドバー（公開日が近い映画）でこの並びを使うと見出しと中身が
   * 食い違うため、一覧ページだけが true を渡す。
   */
  prioritize_streaming: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

/**
 * ウォッチリスト一覧取得クエリの型
 */
export type WatchlistQueryParams = z.infer<typeof watchlistQuerySchema>;

/**
 * 一括削除の対象一覧取得クエリのバリデーションスキーマ
 *
 * year は必須。追加日（added_at）の年を JST で解釈する前提で、
 * 実際の範囲計算は API 側の getJstYearRange が行う。
 */
export const watchlistWatchedQuerySchema = z.object({
  year: z.coerce
    .number({ error: '追加年は数値で指定してください' })
    .int('追加年は整数で指定してください')
    .min(
      WATCHLIST_CLEANUP_MIN_YEAR,
      `追加年は${WATCHLIST_CLEANUP_MIN_YEAR}以上で指定してください`,
    )
    .max(
      WATCHLIST_CLEANUP_MAX_YEAR,
      `追加年は${WATCHLIST_CLEANUP_MAX_YEAR}以下で指定してください`,
    ),
  // 既存の watchlistQuerySchema は cursor を z.string() のまま受け、route 側で
  // parseInt と負数チェックをしている。ここはスキーマに寄せて二重化させない
  cursor: z.coerce
    .number({ error: 'カーソルは数値で指定してください' })
    .int('カーソルは整数で指定してください')
    .min(0, 'カーソルは0以上で指定してください')
    .default(0),
  limit: z.coerce
    .number()
    .int()
    .min(1, '取得件数は1以上で指定してください')
    .max(
      WATCHLIST_MAX_LIMIT,
      `取得件数は${WATCHLIST_MAX_LIMIT}以下で指定してください`,
    )
    .default(WATCHLIST_DEFAULT_LIMIT),
});

/**
 * 一括削除の対象一覧取得クエリの型
 */
export type WatchlistWatchedQueryParams = z.infer<
  typeof watchlistWatchedQuerySchema
>;

/**
 * 視聴済み一括削除のバリデーションスキーマ
 *
 * exclude_ids は「チェックを外した作品」。空配列はその年の視聴済み全件が対象。
 * include_ids への切り替えは持たない（全解除に近い使い方でもボディは数十KBに
 * 収まり、分岐を増やす利得が無い）。
 */
export const watchlistBulkDeleteSchema = z.object({
  year: z
    .number({ error: '追加年は数値で指定してください' })
    .int('追加年は整数で指定してください')
    .min(
      WATCHLIST_CLEANUP_MIN_YEAR,
      `追加年は${WATCHLIST_CLEANUP_MIN_YEAR}以上で指定してください`,
    )
    .max(
      WATCHLIST_CLEANUP_MAX_YEAR,
      `追加年は${WATCHLIST_CLEANUP_MAX_YEAR}以下で指定してください`,
    ),
  exclude_ids: z
    .array(z.string().uuid('除外IDの形式が不正です'))
    .max(
      WATCHLIST_BULK_DELETE_MAX_EXCLUDE_IDS,
      `除外できるのは${WATCHLIST_BULK_DELETE_MAX_EXCLUDE_IDS}件までです`,
    )
    .default([]),
});

/**
 * 視聴済み一括削除の型
 */
export type WatchlistBulkDeleteFormData = z.infer<
  typeof watchlistBulkDeleteSchema
>;
