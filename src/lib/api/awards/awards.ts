/**
 * 受賞作品API クライアント
 */

import { API_ENDPOINTS } from '@/constants';
import type { AwardsApiResponse } from '@/features/awards/types';
import { axiosInstance } from '@/lib/axios/axios';

/**
 * 受賞作品データを取得する
 *
 * @param year - 取得する年度
 * @param cacheBuster - 指定するとクエリ `t` に載せる。
 *   `/api/awards` は `public, s-maxage=3600, stale-while-revalidate=86400`
 *   を返すため、同じURLだとブラウザがキャッシュから返す（実測で
 *   transferSize=0 を確認）。手動同期の直後に反映を確認したいときだけ、
 *   URL を変えて取り直させるために使う。
 */
export async function getAwards(
  year: number,
  cacheBuster?: string,
): Promise<AwardsApiResponse['data']> {
  const response = await axiosInstance.get<AwardsApiResponse>(
    API_ENDPOINTS.AWARDS,
    {
      params: cacheBuster ? { year, t: cacheBuster } : { year },
    },
  );
  return response.data.data;
}
