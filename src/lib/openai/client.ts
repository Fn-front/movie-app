/**
 * OpenAI APIクライアント
 */

import OpenAI from 'openai';

import { OPENAI_CONFIG } from '@/constants';

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

  // SDK 既定（timeout 10分 / maxRetries 2）のままだと1呼び出しが最大30分
  // ブロックしうる。受賞作品の同期は部門数ぶん繰り返すため、上界が決まらないと
  // 手動同期の失効判定（AWARD_SYNC_STALE_MINUTES）が成り立たない
  return new OpenAI({
    apiKey,
    timeout: OPENAI_CONFIG.REQUEST_TIMEOUT_MS,
    maxRetries: OPENAI_CONFIG.MAX_RETRIES,
  });
}

/**
 * 使用するOpenAIモデル名を取得
 */
export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL || OPENAI_CONFIG.DEFAULT_MODEL;
}
