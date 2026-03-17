/**
 * 原題提案のバリデーションスキーマ
 */

import { z } from 'zod';

/**
 * 原題提案APIクエリパラメータスキーマ
 */
export const titleSuggestionQuerySchema = z.object({
  query: z.string().trim().min(1, '検索キーワードは必須です').max(255),
});

/**
 * OpenAIレスポンススキーマ（複数候補）
 */
export const openAiTitleSuggestionsResponseSchema = z.object({
  suggestions: z.array(z.string().min(1)).max(5),
});

/**
 * OpenAIレスポンスの型
 */
export type OpenAiTitleSuggestionsResponse = z.infer<
  typeof openAiTitleSuggestionsResponseSchema
>;
