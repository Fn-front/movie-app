/**
 * 映画API クライアント
 */

import { axiosInstance } from '@/lib/axios/axios';

/**
 * 映画キャッシュアイテムの型
 */
export interface MovieCacheItem {
  /** TMDb映画ID */
  id: number;
  /** 映画タイトル */
  title: string;
  /** ポスター画像パス */
  poster_path: string | null;
  /** バックドロップ画像パス */
  backdrop_path: string | null;
  /** 公開日 */
  release_date: string | null;
  /** 概要 */
  overview: string | null;
  /** 評価平均 */
  vote_average: number | null;
  /** 人気度 */
  popularity: number | null;
  /** ジャンルID配列 */
  genre_ids: number[] | null;
  /** リリースタイプ */
  release_type: 'theatrical' | 'streaming';
  /** リバイバル上映フラグ */
  is_revival: boolean;
}

/**
 * 映画一覧リクエストの型
 */
export interface GetMoviesRequest {
  page?: number;
  sort_by?: 'release_date' | 'popularity' | 'vote_average';
  release_type?: 'theatrical' | 'streaming';
  genre_ids?: string;
  /** 公開日の開始日（YYYY-MM-DD） */
  release_date_gte?: string;
  /** 公開日の終了日（YYYY-MM-DD） */
  release_date_lte?: string;
  /** リバイバル上映フィルタ（trueでリバイバルのみ、falseで非リバイバルのみ） */
  is_revival?: boolean;
}

/**
 * ページネーション情報の型
 */
export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
}

/**
 * 映画一覧レスポンスの型
 */
export interface GetMoviesResponse {
  success: true;
  data: {
    movies: MovieCacheItem[];
    pagination: PaginationInfo;
    genres: Record<number, string>;
  };
}

/**
 * 映画一覧を取得
 *
 * @param params - クエリパラメータ
 * @returns 映画一覧レスポンス
 */
export async function getMovies(
  params: GetMoviesRequest = {},
): Promise<GetMoviesResponse> {
  const response = await axiosInstance.get<GetMoviesResponse>('/api/movies', {
    params,
  });
  return response.data;
}
