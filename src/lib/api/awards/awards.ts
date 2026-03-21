/**
 * 受賞作品API クライアント
 */

import type { AwardsApiResponse } from '@/features/awards/types';
import { axiosInstance } from '@/lib/axios/axios';

/**
 * 受賞作品データを取得する
 */
export async function getAwards(
  year: number,
): Promise<AwardsApiResponse['data']> {
  const response = await axiosInstance.get<AwardsApiResponse>('/api/awards', {
    params: { year },
  });
  return response.data.data;
}
