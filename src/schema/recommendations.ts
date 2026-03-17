/**
 * レコメンド関連のバリデーションスキーマ
 */

import { z } from 'zod';

import { RECOMMENDATIONS_MAX_COUNT, MOVIE_YEAR_RANGE } from '@/constants';

/**
 * OpenAIレスポンスの個別レコメンド項目スキーマ
 */
export const openAiRecommendationItemSchema = z.object({
  title: z.string().min(1, '映画タイトルは必須です'),
  year: z
    .number()
    .int('公開年は整数で入力してください')
    .min(MOVIE_YEAR_RANGE.MIN, '公開年が不正です')
    .max(MOVIE_YEAR_RANGE.MAX, '公開年が不正です'),
  reason: z.string().min(1, '推薦理由は必須です'),
});

/**
 * OpenAIレスポンス全体スキーマ
 */
export const openAiRecommendationsResponseSchema = z.object({
  recommendations: z
    .array(openAiRecommendationItemSchema)
    .min(1, 'レコメンドは1件以上必要です')
    .max(
      RECOMMENDATIONS_MAX_COUNT,
      `レコメンドは${RECOMMENDATIONS_MAX_COUNT}件以下にしてください`,
    ),
});

/**
 * OpenAIレスポンスの型
 */
export type OpenAiRecommendationItem = z.infer<
  typeof openAiRecommendationItemSchema
>;
export type OpenAiRecommendationsResponse = z.infer<
  typeof openAiRecommendationsResponseSchema
>;

/**
 * APIレスポンスの個別レコメンド項目スキーマ
 */
export const recommendationSchema = z.object({
  id: z.string().uuid(),
  tmdb_movie_id: z.number().int().positive(),
  title: z.string().min(1).max(255),
  poster_path: z.string().max(255).nullable(),
  release_date: z.string().nullable(),
  vote_average: z.number().min(0).max(10).nullable(),
  genre_ids: z.array(z.number().int()).nullable(),
  reason: z.string().min(1),
  display_order: z.number().int().min(1).max(RECOMMENDATIONS_MAX_COUNT),
});

/**
 * APIレスポンスの型
 */
export type Recommendation = z.infer<typeof recommendationSchema>;
