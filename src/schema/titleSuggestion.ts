/**
 * 原題提案のバリデーションスキーマ
 */

import { z } from 'zod';

/**
 * 原題提案APIクエリパラメータスキーマ
 */
export const titleSuggestionQuerySchema = z.object({
  query: z.string().trim().min(1, '検索キーワードは必須です'),
});

/**
 * OpenAIレスポンススキーマ
 */
export const openAiTitleSuggestionResponseSchema = z.object({
  suggested_title: z.string().min(1).nullable(),
});

/**
 * OpenAIレスポンスの型
 */
export type OpenAiTitleSuggestionResponse = z.infer<
  typeof openAiTitleSuggestionResponseSchema
>;
