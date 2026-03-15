/**
 * 興味なし映画API クライアント
 */

import { axiosInstance } from '@/lib/axios/axios';

/**
 * 興味なし映画追加リクエストの型
 */
export interface AddDismissedMovieRequest {
  tmdb_movie_id: number;
  title: string;
  genre_ids?: number[] | null;
}

/**
 * 興味なし映画追加レスポンスの型
 */
export interface AddDismissedMovieResponse {
  success: true;
  message: string;
  data: {
    id: string;
    tmdb_movie_id: number;
    title: string;
    genre_ids: number[] | null;
    created_at: string;
  };
}

/**
 * 興味なし映画一覧アイテムの型
 */
export interface DismissedMovieItem {
  id: string;
  tmdb_movie_id: number;
  title: string;
  poster_path: string | null;
  genre_ids: number[] | null;
  created_at: string;
}

/**
 * 興味なし映画一覧レスポンスの型
 */
export interface GetDismissedMoviesResponse {
  success: true;
  data: DismissedMovieItem[];
}

/**
 * 興味なし一覧を取得
 */
export async function getDismissedMovies(): Promise<DismissedMovieItem[]> {
  const response = await axiosInstance.get<GetDismissedMoviesResponse>(
    '/api/dismissed-movies',
  );
  return response.data.data;
}

/**
 * 興味なしに追加
 */
export async function addDismissedMovie(
  data: AddDismissedMovieRequest,
): Promise<AddDismissedMovieResponse> {
  const response = await axiosInstance.post<AddDismissedMovieResponse>(
    '/api/dismissed-movies',
    data,
  );
  return response.data;
}

/**
 * 興味なしから削除
 */
export async function removeDismissedMovie(tmdbMovieId: number): Promise<void> {
  await axiosInstance.delete(
    `/api/dismissed-movies?tmdb_movie_id=${tmdbMovieId}`,
  );
}
