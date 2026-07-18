/**
 * 受賞作品API クライアント
 */

import { API_ENDPOINTS } from '@/constants';
import type { AwardsApiResponse } from '@/features/awards/types';
import { axiosInstance } from '@/lib/axios/axios';

/**
 * 受賞作品データを取得する
 */
export async function getAwards(
  year: number,
): Promise<AwardsApiResponse['data']> {
  const response = await axiosInstance.get<AwardsApiResponse>(
    API_ENDPOINTS.AWARDS,
    {
      params: { year },
    },
  );
  return response.data.data;
}
