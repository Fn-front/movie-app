/**
 * レコメンドAPI クライアント
 */

import { axiosInstance } from '@/lib/axios/axios';
import type { RecommendationsApiResponse } from '@/schema/recommendations';

/**
 * レコメンド取得レスポンスの型
 */
export interface GetRecommendationsResponse {
  success: true;
  data: RecommendationsApiResponse;
}

/**
 * レコメンド一覧を取得
 */
export async function getRecommendationsApi(): Promise<GetRecommendationsResponse> {
  const response = await axiosInstance.get<GetRecommendationsResponse>(
    '/api/recommendations',
  );
  return response.data;
}
