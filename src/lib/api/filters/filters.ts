/**
 * フィルター条件保存API クライアント
 */

import { axiosInstance } from '@/lib/axios/axios';
import type { FilterConditions } from '@/schema/filters';

/**
 * フィルター取得レスポンスの型
 */
export interface GetSavedFilterResponse {
  success: true;
  data: {
    filter_conditions: FilterConditions;
  };
}

/**
 * 保存済みフィルター条件を取得
 *
 * @returns フィルター条件（未保存の場合は空オブジェクト）
 */
export async function getSavedFilter(): Promise<FilterConditions> {
  const response =
    await axiosInstance.get<GetSavedFilterResponse>('/api/filters');
  return response.data.data.filter_conditions;
}

/**
 * フィルター条件を保存
 *
 * @param conditions - 保存するフィルター条件
 */
export async function saveFilter(conditions: FilterConditions): Promise<void> {
  await axiosInstance.put('/api/filters', conditions);
}
