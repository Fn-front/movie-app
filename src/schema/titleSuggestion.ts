/**
 * 原題提案のバリデーションスキーマ
 */

import { z } from 'zod';

import { TITLE_SUGGESTION } from '@/constants';

/**
 * 原題提案APIクエリパラメータスキーマ
 */
export const titleSuggestionQuerySchema = z.object({
  query: z.string().trim().min(1, '検索キーワードは必須です').max(255),
});

/**
 * OpenAIレスポンススキーマ（複数候補）
 *
 * LLMは上限件数を超えて返すことがある。上限超過を弾かず、検証前に上限件数へ
 * 切り詰める（超過分は破棄）。原題提案は下流で件数制御しないため slice が実効上限。
 * 空配列は許容（入力が既に原題／映画と無関係の場合に返る）。
 */
export const openAiTitleSuggestionsResponseSchema = z.object({
  suggestions: z.preprocess(
    (value) =>
      Array.isArray(value)
        ? value.slice(0, TITLE_SUGGESTION.MAX_SUGGESTIONS)
        : value,
    z.array(z.string().min(1)),
  ),
});

/**
 * OpenAIレスポンスの型
 */
export type OpenAiTitleSuggestionsResponse = z.infer<
  typeof openAiTitleSuggestionsResponseSchema
>;
