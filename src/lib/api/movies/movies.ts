/**
 * 映画API クライアント
 */

import { axiosInstance } from '@/lib/axios/axios';
import type { MovieDetail } from '@/lib/types';

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
  /** ソート順（asc: 昇順、desc: 降順） */
  sort_order?: 'asc' | 'desc';
  release_type?: 'theatrical' | 'streaming';
  /** 時間枠（upcoming: 公開予定、now_showing: 公開中） */
  time_frame?: 'upcoming' | 'now_showing';
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
  hasNextPage: boolean;
  nextPage: number | null;
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
  options?: { signal?: AbortSignal },
): Promise<GetMoviesResponse> {
  const response = await axiosInstance.get<GetMoviesResponse>('/api/movies', {
    params,
    signal: options?.signal,
  });
  return response.data;
}

/**
 * 映画詳細レスポンスの型
 */
export interface GetMovieDetailResponse {
  success: true;
  data: MovieDetail;
}

/**
 * 映画詳細を取得
 *
 * @param movieId - 映画ID
 * @returns 映画詳細レスポンス
 */
export async function getMovieDetail(
  movieId: number,
): Promise<GetMovieDetailResponse> {
  const response = await axiosInstance.get<GetMovieDetailResponse>(
    `/api/movies/${movieId}`,
  );
  return response.data;
}
