/**
 * 原題提案API クライアント
 */

import { axiosInstance } from '@/lib/axios/axios';

/**
 * 原題提案レスポンスの型
 */
export interface TitleSuggestionResponse {
  success: true;
  data: {
    /** 提案された原題候補の配列 */
    suggestions: string[];
    /** DBキャッシュから取得されたか */
    cached: boolean;
  };
}

/**
 * 原題提案を取得
 */
export async function suggestTitleApi(
  query: string,
  options?: { signal?: AbortSignal },
): Promise<TitleSuggestionResponse> {
  const response = await axiosInstance.get<TitleSuggestionResponse>(
    '/api/movies/suggest-title',
    {
      params: { query },
      signal: options?.signal,
    },
  );
  return response.data;
}
