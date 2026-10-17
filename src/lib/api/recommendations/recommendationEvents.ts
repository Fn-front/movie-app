/**
 * レコメンド利用イベント記録API クライアント
 */

import { API_ENDPOINTS } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';
import type { RecommendationEvent } from '@/schema/recommendations';

/**
 * レコメンド利用イベントをまとめて記録する
 *
 * 計測はユーザー操作の副次処理なので、失敗しても呼び出し側の
 * 処理は止めない（呼び出し側で握りつぶす前提）。
 *
 * @param events - 記録するイベント
 */
export async function recordRecommendationEvents(
  events: RecommendationEvent[],
): Promise<void> {
  await axiosInstance.post(API_ENDPOINTS.RECOMMENDATIONS_EVENTS, { events });
}
