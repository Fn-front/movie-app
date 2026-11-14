/**
 * レコメンドAPI クライアント
 */

import { API_ENDPOINTS } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';
import type { RecommendationData } from '@/lib/api/recommendations/recommendationData';
import type { Recommendation } from '@/schema/recommendations';

/**
 * レコメンド一覧レスポンスの型
 */
export interface GetRecommendationsResponse {
  success: true;
  data: RecommendationData;
}

/**
 * レコメンド一覧を取得する
 *
 * ホーム（`/`）を静的プリレンダに保つため、サーバー取得から移した（#1115）。
 */
export async function getRecommendations(): Promise<RecommendationData> {
  const response = await axiosInstance.get<GetRecommendationsResponse>(
    API_ENDPOINTS.RECOMMENDATIONS,
  );
  return response.data.data;
}

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
 *
 * @param signal - 中断シグナル。サーバー側は request.signal を受けて生成を打ち切り、
 *                 消費した回数枠を取り消す。
 *                 ※ useRecommendationRefresh からは渡さない（画面遷移で生成を
 *                 止めないため）。タブを閉じた場合はブラウザが自動で中断する。
 */
export async function refreshRecommendations(
  signal?: AbortSignal,
): Promise<RefreshRecommendationsResponse['data']> {
  const response = await axiosInstance.post<RefreshRecommendationsResponse>(
    API_ENDPOINTS.RECOMMENDATIONS_REFRESH,
    undefined,
    { signal },
  );
  return response.data.data;
}

/**
 * 当月の更新回数情報を取得する
 */
export async function getRefreshCount(): Promise<RefreshCountResponse['data']> {
  const response = await axiosInstance.get<RefreshCountResponse>(
    API_ENDPOINTS.RECOMMENDATIONS_REFRESH_COUNT,
  );
  return response.data.data;
}
