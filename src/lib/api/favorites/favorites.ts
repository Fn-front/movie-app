/**
 * お気に入りAPI クライアント
 */

import { axiosInstance } from '@/lib/axios/axios';
import type { FavoritesAddFormData, FavoritesUpdateFormData } from '@/schema/favorites';

/**
 * お気に入りアイテムの型
 */
export interface FavoriteItem {
  /** お気に入りID */
  id: string;
  /** TMDb映画ID */
  tmdb_movie_id: number;
  /** 映画タイトル */
  title: string;
  /** ポスター画像パス */
  poster_path: string | null;
  /** 公開日 */
  release_date: string | null;
  /** ユーザー評価（1〜10） */
  rating: number;
  /** 登録日時 */
  added_at: string;
}

/**
 * 映画に紐づくお気に入り情報の型
 */
export interface MovieFavoriteInfo {
  /** お気に入りID */
  id: string;
  /** ユーザー評価（1〜10） */
  rating: number;
}

/**
 * お気に入り一覧取得リクエストの型
 */
export interface GetFavoritesRequest {
  sort_by?: 'added_at' | 'rating';
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

/**
 * お気に入り一覧取得レスポンスの型
 */
export interface GetFavoritesResponse {
  success: true;
  data: {
    favorites: FavoriteItem[];
    total: number;
    page: number;
    limit: number;
  };
}

/**
 * お気に入り追加レスポンスの型
 */
export interface AddFavoriteResponse {
  success: true;
  message: string;
  data: FavoriteItem;
}

/**
 * お気に入り評価更新レスポンスの型
 */
export interface UpdateFavoriteRatingResponse {
  success: true;
  message: string;
  data: FavoriteItem;
}

/**
 * お気に入り一覧を取得
 *
 * @param params - クエリパラメータ
 * @returns お気に入り一覧レスポンス
 */
export async function getFavorites(
  params: GetFavoritesRequest = {},
): Promise<GetFavoritesResponse> {
  const response = await axiosInstance.get<GetFavoritesResponse>(
    '/api/favorites',
    { params },
  );
  return response.data;
}

/**
 * お気に入りに追加
 *
 * @param data - 追加する映画情報
 * @returns 追加レスポンス
 */
export async function addFavorite(
  data: FavoritesAddFormData,
): Promise<AddFavoriteResponse> {
  const response = await axiosInstance.post<AddFavoriteResponse>(
    '/api/favorites',
    data,
  );
  return response.data;
}

/**
 * お気に入りの評価を更新
 *
 * @param id - お気に入りID
 * @param data - 更新データ
 * @returns 更新レスポンス
 */
export async function updateFavoriteRating(
  id: string,
  data: FavoritesUpdateFormData,
): Promise<UpdateFavoriteRatingResponse> {
  const response = await axiosInstance.patch<UpdateFavoriteRatingResponse>(
    `/api/favorites/${id}`,
    data,
  );
  return response.data;
}

/**
 * お気に入りから削除
 *
 * @param id - お気に入りID
 */
export async function removeFavorite(id: string): Promise<void> {
  await axiosInstance.delete(`/api/favorites/${id}`);
}
