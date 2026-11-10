/**
 * 検索関連のバリデーションスキーマ
 */

import { z } from 'zod';

import { PAGINATION } from '@/constants';
import { SEARCH_VALIDATION } from '@/constants/search';
import { isRealCalendarDate } from '@/utils/date';

/**
 * 公開期間の日付
 *
 * 形式だけでなく**実在する日付か**まで見る。正規表現は桁数しか見ないため
 * `2026-13-45` が通過してしまう（#995 で一覧APIが 500 を返していたのと同じ原因）。
 */
const releaseDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付はYYYY-MM-DD形式で指定してください')
  .refine(isRealCalendarDate, {
    message: '存在しない日付です',
  });

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
    // 映画一覧API（schema/movies.ts の genre_ids）と同じ検証・変換に揃える
    genre: z
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
    year: z.coerce
      .number()
      .int()
      .min(SEARCH_VALIDATION.YEAR_MIN)
      .max(new Date().getFullYear() + 5)
      .optional(),
    /**
     * 公開期間の開始日（`release_date.gte`）
     *
     * ⚠️ `year`（`primary_release_year`）とは**意味が違う**。
     * `year` は TMDb の代表公開日の年で絞るのに対し、こちらは
     * **いずれかの国のリリースレコード**が範囲に入れば一致する。
     * 再上映・各国公開を拾うため、旧作が新しい期間にヒットしうる
     * （`syncEigaMovies` で実際に問題になっている）。
     *
     * 置き換えではなく**別パラメータとして足している**のはそのため。
     * 既存の年検索の結果は変わらない（#997）
     */
    release_date_gte: releaseDateSchema.optional(),
    /** 公開期間の終了日（`release_date.lte`） */
    release_date_lte: releaseDateSchema.optional(),
    vote_average_gte: z.coerce
      .number()
      .min(SEARCH_VALIDATION.VOTE_AVERAGE_MIN)
      .max(SEARCH_VALIDATION.VOTE_AVERAGE_MAX)
      .optional(),
  })
  .refine(
    (data) =>
      data.query ||
      data.genre ||
      data.year !== undefined ||
      data.release_date_gte !== undefined ||
      data.release_date_lte !== undefined ||
      data.vote_average_gte !== undefined,
    {
      message: '検索キーワードまたはフィルター条件を指定してください',
    },
  )
  // 開始日が終了日より後だと、どう絞り込んでも空集合になる（#995 と同じ扱い）
  .refine(
    (data) =>
      data.release_date_gte === undefined ||
      data.release_date_lte === undefined ||
      data.release_date_gte <= data.release_date_lte,
    {
      path: ['release_date_lte'],
      message: '終了日は開始日以降の日付を指定してください',
    },
  )
  // 年と期間は意味論が違うので混ぜない。同時指定は入口で弾く（排他）
  .refine(
    (data) =>
      data.year === undefined ||
      (data.release_date_gte === undefined &&
        data.release_date_lte === undefined),
    {
      path: ['year'],
      message: '公開年と公開期間は同時に指定できません',
    },
  );

/**
 * 検索クエリパラメータの型
 */
export type SearchQueryParams = z.infer<typeof searchQuerySchema>;
