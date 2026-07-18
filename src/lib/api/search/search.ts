/**
 * 検索API クライアント
 */

import { API_ENDPOINTS } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';
import type { Movie } from '@/lib/types';

/**
 * 検索リクエストパラメータの型
 */
export interface SearchMoviesRequest {
  /** 検索キーワード */
  query?: string;
  /** ページ番号 */
  page?: number;
  /** ジャンルID（カンマ区切り） */
  genre?: string;
  /** 公開年 */
  year?: number;
  /** 最低評価 */
  vote_average_gte?: number;
}

/**
 * 検索ページネーション情報の型
 */
export interface SearchPaginationInfo {
  /** 現在のページ */
  page: number;
  /** 総ページ数 */
  totalPages: number;
  /** 総件数 */
  totalResults: number;
  /** サーバー側フィルタリングが適用されたか */
  isServerFiltered: boolean;
}

/**
 * 検索レスポンスの型
 */
export interface SearchMoviesResponse {
  success: true;
  data: {
    movies: Movie[];
    pagination: SearchPaginationInfo;
  };
}

/**
 * 映画を検索
 */
export async function searchMoviesApi(
  params: SearchMoviesRequest,
  options?: { signal?: AbortSignal },
): Promise<SearchMoviesResponse> {
  const response = await axiosInstance.get<SearchMoviesResponse>(
    API_ENDPOINTS.MOVIES_SEARCH,
    {
      params,
      signal: options?.signal,
    },
  );
  return response.data;
}
