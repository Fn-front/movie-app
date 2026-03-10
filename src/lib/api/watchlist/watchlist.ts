/**
 * ウォッチリストAPI クライアント
 */

import { axiosInstance } from '@/lib/axios/axios';
import type { WatchlistAddFormData } from '@/schema/watchlist';

/**
 * ウォッチリストアイテムの型
 */
export interface WatchlistItem {
  /** ウォッチリストID */
  id: string;
  /** TMDb映画ID */
  tmdb_movie_id: number;
  /** 映画タイトル */
  title: string;
  /** ポスター画像パス */
  poster_path: string | null;
  /** 公開日 */
  release_date: string | null;
  /** 追加日時 */
  added_at: string;
}

/**
 * ウォッチリスト一覧取得リクエストの型
 */
export interface GetWatchlistRequest {
  cursor?: string;
  limit?: number;
}

/**
 * ウォッチリスト一覧取得レスポンスの型
 */
export interface GetWatchlistResponse {
  success: true;
  data: {
    watchlist: WatchlistItem[];
    next_cursor: string | null;
    has_more: boolean;
  };
}

/**
 * ウォッチリスト追加レスポンスの型
 */
export interface AddWatchlistResponse {
  success: true;
  message: string;
  data: WatchlistItem;
}

/**
 * ウォッチリスト一覧を取得
 *
 * @param params - クエリパラメータ
 * @returns ウォッチリスト一覧レスポンス
 */
export async function getWatchlist(
  params: GetWatchlistRequest = {},
): Promise<GetWatchlistResponse> {
  const response = await axiosInstance.get<GetWatchlistResponse>(
    '/api/watchlist',
    { params },
  );
  return response.data;
}

/**
 * ウォッチリストに追加
 *
 * @param data - 追加する映画情報
 * @returns 追加レスポンス
 */
export async function addWatchlist(
  data: WatchlistAddFormData,
): Promise<AddWatchlistResponse> {
  const response = await axiosInstance.post<AddWatchlistResponse>(
    '/api/watchlist',
    data,
  );
  return response.data;
}

/**
 * ウォッチリストから削除
 *
 * @param id - ウォッチリストID
 */
export async function removeWatchlist(id: string): Promise<void> {
  await axiosInstance.delete(`/api/watchlist/${id}`);
}
