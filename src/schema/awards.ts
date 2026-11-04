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
  /**
   * 人に贈られる部門の氏名
   *
   * `.nullish()` にしているのは、OpenAI の Structured Outputs が strict モードで
   * **全キーを required にする**ため、作品賞では `null` が返るから。
   * `.optional()` だと `null` を弾き、レスポンス全体が不正扱いになって取得0件になる。
   * eiga.com / wikitext パーサは人名なしのとき項目自体を省くので undefined も許す
   */
  person_name: z.string().nullish(),
});

/**
 * OpenAIレスポンス全体スキーマ
 */
export const openAiAwardsResponseSchema = z.object({
  awards: z.array(openAiAwardItemSchema),
});

/**
 * OpenAIレスポンスの型
 */
export type OpenAiAwardItem = z.infer<typeof openAiAwardItemSchema>;
export type OpenAiAwardsResponse = z.infer<typeof openAiAwardsResponseSchema>;
