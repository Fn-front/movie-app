/**
 * 人物API クライアント
 */

import { API_ENDPOINTS } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';
import type { PersonDetail } from '@/lib/types';

/**
 * 人物詳細レスポンスの型
 */
export interface GetPersonDetailResponse {
  success: true;
  data: PersonDetail;
}

/**
 * 人物詳細を取得
 *
 * @param personId - 人物ID
 * @returns 人物詳細
 */
export async function getPerson(personId: number): Promise<PersonDetail> {
  const response = await axiosInstance.get<GetPersonDetailResponse>(
    API_ENDPOINTS.personById(personId),
  );
  return response.data.data;
}
