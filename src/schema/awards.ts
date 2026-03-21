/**
 * 受賞作品関連のバリデーションスキーマ
 */

import { z } from 'zod';

/**
 * OpenAIレスポンスの個別受賞作品項目スキーマ
 */
export const openAiAwardItemSchema = z.object({
  title_ja: z.string().min(1, '日本語タイトルは必須です'),
  title_en: z.string().min(1, '英語タイトルは必須です'),
  category: z.string().min(1, '部門キーは必須です'),
  is_winner: z.boolean(),
  year: z.number().int().min(1900).max(2100),
});

/**
 * OpenAIレスポンス全体スキーマ
 */
export const openAiAwardsResponseSchema = z.object({
  awards: z.array(openAiAwardItemSchema).min(1, '受賞作品は1件以上必要です'),
});

/**
 * OpenAIレスポンスの型
 */
export type OpenAiAwardItem = z.infer<typeof openAiAwardItemSchema>;
export type OpenAiAwardsResponse = z.infer<typeof openAiAwardsResponseSchema>;
