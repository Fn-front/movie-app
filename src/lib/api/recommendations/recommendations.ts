/**
 * レコメンド手動更新API クライアント
 */

import { axiosInstance } from '@/lib/axios/axios';
import type { Recommendation } from '@/schema/recommendations';

/**
 * レコメンド更新レスポンスの型
 */
export interface RefreshRecommendationsResponse {
  success: true;
  data: {
    remainingCount: number;
    recommendations: Recommendation[];
  };
}

/**
 * レコメンド更新回数レスポンスの型
 */
export interface RefreshCountResponse {
  success: true;
  data: {
    usedCount: number;
    maxCount: number;
    remainingCount: number;
  };
}

/**
 * レコメンドを手動更新する
 */
export async function refreshRecommendations(): Promise<RefreshRecommendationsResponse['data']> {
  const response = await axiosInstance.post<RefreshRecommendationsResponse>(
    '/api/recommendations/refresh',
  );
  return response.data.data;
}

/**
 * 当月の更新回数情報を取得する
 */
export async function getRefreshCount(): Promise<RefreshCountResponse['data']> {
  const response = await axiosInstance.get<RefreshCountResponse>(
    '/api/recommendations/refresh-count',
  );
  return response.data.data;
}
