/**
 * OpenAI APIクライアント
 */

import OpenAI from 'openai';

const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * OpenAIクライアントを作成
 *
 * @returns OpenAIクライアント、APIキー未設定の場合はnull
 */
export function createOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey });
}

/**
 * 使用するOpenAIモデル名を取得
 */
export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}
