/**
 * 劇場API クライアント
 */

import type {
  TheatersApiResponse,
  TheaterDetailApiResponse,
} from '@/features/theaterExperience/types';
import { axiosInstance } from '@/lib/axios/axios';

/**
 * 劇場一覧を取得する
 */
export async function getTheaters(): Promise<TheatersApiResponse['data']> {
  const response =
    await axiosInstance.get<TheatersApiResponse>('/api/theaters');
  return response.data.data;
}

/**
 * 劇場詳細を取得する（座席・スピーカー含む）
 */
export async function getTheaterBySlug(
  slug: string,
): Promise<TheaterDetailApiResponse['data']> {
  const response = await axiosInstance.get<TheaterDetailApiResponse>(
    `/api/theaters/${slug}`,
  );
  return response.data.data;
}
