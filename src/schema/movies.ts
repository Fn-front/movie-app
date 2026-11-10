/**
 * 映画関連のバリデーションスキーマ
 */

import { z } from 'zod';

import {
  PAGINATION,
  SEARCH_VALIDATION,
  WATCH_PROVIDER_OFFER_TYPES,
} from '@/constants';
import { REGION_GROUP_KEYS } from '@/constants/movies';
import { isSelectableWatchProvider } from '@/lib/movies/watchProviders';
import { isRealCalendarDate } from '@/utils/date';

/**
 * 公開日フィルターの日付
 *
 * 形式に加えて**実在する日付か**まで見る。正規表現は桁数しか見ないため、
 * `2026-13-45` が通過して Postgres の `date` 比較で例外になり、
 * クライアント起因の不正入力に 500 を返していた（#995）。
 */
const releaseDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付はYYYY-MM-DD形式で指定してください')
  .refine(isRealCalendarDate, {
    message: '存在しない日付です',
  });

/**
 * 映画一覧クエリパラメータ（各フィールドの検証）
 *
 * 相関チェックは `moviesQuerySchema` 側で足す。`superRefine` を通すと
 * `ZodObject` でなくなり `.shape` や `.extend()` が使えなくなるため、
 * 素の object はここに残しておく
 */
const moviesQueryObjectSchema = z.object({
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
  release_date_gte: releaseDateSchema.optional(),
  release_date_lte: releaseDateSchema.optional(),
  is_revival: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  // 配信サービスでの絞り込み。選択肢に無いIDはクエリに乗せても意味が無いため、
  // 既知のプロバイダーだけを残す（空になったら未指定として扱う）
  watch_providers: z
    .string()
    .regex(
      /^\d+(,\d+)*$/,
      'プロバイダーIDはカンマ区切りの正の整数で指定してください',
    )
    .transform((val) =>
      val.split(',').map(Number).filter(isSelectableWatchProvider),
    )
    .optional(),
  offer_types: z
    .string()
    .transform((val) => val.split(','))
    .pipe(z.array(z.enum(WATCH_PROVIDER_OFFER_TYPES)))
    .optional(),
  // 表示に含める地域グループ。未指定は「3グループすべて除外」を意味する
  // （既定で非表示にする挙動をAPI層で担保する）
  include_regions: z
    .string()
    .transform((val) => val.split(','))
    .pipe(z.array(z.enum(REGION_GROUP_KEYS)))
    .optional(),
});

/**
 * 映画一覧クエリパラメータのバリデーションスキーマ（相関チェック込み）
 *
 * 開始日が終了日より後だと、どう絞り込んでも空集合になる。これを
 * 200 / 0件で返していたため、利用者には「該当なし」と区別が付かなかった（#995）。
 *
 * ⚠️ `YYYY-MM-DD` はゼロ埋めされているので文字列比較で日付の前後を判定できる。
 */
export const moviesQuerySchema = moviesQueryObjectSchema.superRefine(
  (value, ctx) => {
    const gte = value.release_date_gte;
    const lte = value.release_date_lte;

    if (gte === undefined || lte === undefined) return;
    if (gte <= lte) return;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['release_date_lte'],
      message: '終了日は開始日以降の日付を指定してください',
    });
  },
);

/**
 * 映画一覧クエリパラメータの型
 */
export type MoviesQueryParams = z.infer<typeof moviesQuerySchema>;
