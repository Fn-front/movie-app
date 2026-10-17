/**
 * レコメンド関連のバリデーションスキーマ
 */

import { z } from 'zod';

import {
  RECOMMENDATIONS_MAX_COUNT,
  RECOMMENDATIONS_MAX_REQUEST_COUNT,
  MOVIE_YEAR_RANGE,
} from '@/constants';

/**
 * AIレスポンスとして保持する最大件数（1回の要求件数の上限と揃える）。
 * LLMは要求件数を厳密に守らず超過して返すことがあるため、超過分は
 * バリデーションエラーにせず、この件数まで切り詰める（超過分は破棄）。
 */
const OPENAI_RECOMMENDATIONS_MAX_RESPONSE = RECOMMENDATIONS_MAX_REQUEST_COUNT;

/**
 * OpenAIレスポンスの個別レコメンド項目スキーマ
 *
 * 邦題・原題の両方を返させることで、TMDb検索の取りこぼしを減らす。
 * 単一の曖昧なタイトル文字列だけでは、表記揺れ（中黒の有無など）で
 * 検索0件になったり、同名の別作品に誤ヒットしたりする。
 */
export const openAiRecommendationItemSchema = z.object({
  title_ja: z.string().min(1, '邦題は必須です'),
  title_en: z.string().min(1, '原題は必須です'),
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
  // LLMは要求件数を超えて返すことがある。上限超過を弾かず、かつ全件を検証する
  // 無駄（巨大配列時のコスト）を避けるため、検証前に上限件数へ切り詰める。
  recommendations: z.preprocess(
    (value) =>
      Array.isArray(value)
        ? value.slice(0, OPENAI_RECOMMENDATIONS_MAX_RESPONSE)
        : value,
    z
      .array(openAiRecommendationItemSchema)
      .min(1, 'レコメンドは1件以上必要です'),
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
  vote_count: z.number().int().nonnegative(),
  genre_ids: z.array(z.number().int()).nullable(),
  reason: z.string().min(1),
  display_order: z.number().int().min(1).max(RECOMMENDATIONS_MAX_COUNT),
});

/**
 * APIレスポンスの型
 */
export type Recommendation = z.infer<typeof recommendationSchema>;
