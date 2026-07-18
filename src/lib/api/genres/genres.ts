/**
 * ジャンルAPI クライアント
 */

import { API_ENDPOINTS } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';
import type { Genre } from '@/lib/types';

/**
 * ジャンル一覧レスポンスの型
 */
export interface GetGenresResponse {
  success: true;
  data: {
    genres: Genre[];
  };
}

/**
 * ジャンル一覧を取得
 */
export async function getGenresApi(): Promise<GetGenresResponse> {
  const response = await axiosInstance.get<GetGenresResponse>(
    API_ENDPOINTS.MOVIES_GENRES,
  );
  return response.data;
}
