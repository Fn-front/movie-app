/**
 * フィルター条件のバリデーションスキーマ
 */

import { z } from 'zod';

import { SEARCH_VALIDATION, WATCH_PROVIDER_OFFER_TYPES } from '@/constants';
import { REGION_GROUP_KEYS } from '@/constants/movies';
import { isSelectableWatchProvider } from '@/lib/movies/watchProviders';

/**
 * フィルター条件のバリデーションスキーマ
 */
export const filterConditionsSchema = z.object({
  sort_by: z.enum(['release_date', 'popularity', 'vote_average']).optional(),
  release_type: z.enum(['theatrical', 'streaming']).optional(),
  // APIと同じ上限にする。超過した条件はフィールド単位で捨てられるため、
  // 巨大なlocalStorage/URLを持つクライアントがAPIで400を受ける前に無効化される
  genre_ids: z
    .array(z.number().int().positive())
    .max(SEARCH_VALIDATION.MAX_GENRE_IDS)
    .optional(),
  date_range_gte: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日付はYYYY-MM-DD形式で指定してください')
    .optional(),
  date_range_lte: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日付はYYYY-MM-DD形式で指定してください')
    .optional(),
  is_revival: z.boolean().optional(),
  // 選択肢として用意していないプロバイダーIDは、送ってもAPI側で捨てられる。
  // URL手打ちや古いブックマークで来た値をここで落としておく
  watch_providers: z
    .array(z.number().int().positive())
    .refine((ids) => ids.every(isSelectableWatchProvider), {
      message: '不明な配信サービスが指定されています',
    })
    .optional(),
  offer_types: z.array(z.enum(WATCH_PROVIDER_OFFER_TYPES)).optional(),
  // 表示に含める地域グループ。未指定は「すべて除外」を意味する。
  // 既存の保存済みフィルタにはこのキーが無く、未指定として扱われる
  include_regions: z.array(z.enum(REGION_GROUP_KEYS)).optional(),
});

/**
 * フィルター条件の型
 */
export type FilterConditions = z.infer<typeof filterConditionsSchema>;
