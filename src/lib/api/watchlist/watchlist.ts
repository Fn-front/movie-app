/**
 * ウォッチリストAPI クライアント
 */

import { API_ENDPOINTS } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';
import type {
  WatchlistAddFormData,
  WatchlistSortOption,
} from '@/schema/watchlist';

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
  /** 視聴済みにした日時。null は未視聴 */
  watched_at: string | null;
}

/**
 * ウォッチリスト一覧取得リクエストの型
 */
export interface GetWatchlistRequest {
  cursor?: string;
  limit?: number;
  sort?: WatchlistSortOption;
  /** 視聴済みを除外するか（サイドバー用） */
  exclude_watched?: boolean;
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
    API_ENDPOINTS.WATCHLIST,
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
    API_ENDPOINTS.WATCHLIST,
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
  await axiosInstance.delete(API_ENDPOINTS.watchlistById(id));
}

/**
 * 視聴済み更新リクエストの型
 */
export interface UpdateWatchedRequest {
  /** ウォッチリストID */
  id: string;
  /** 視聴済みにするか */
  watched: boolean;
}

/**
 * 視聴済み更新レスポンスの型
 */
export interface UpdateWatchedResponse {
  success: true;
  message: string;
  data: WatchlistItem;
}

/**
 * 視聴済みを付け外しする
 *
 * @param params - ウォッチリストIDと視聴済みフラグ
 * @returns 更新レスポンス
 */
export async function updateWatched({
  id,
  watched,
}: UpdateWatchedRequest): Promise<UpdateWatchedResponse> {
  const response = await axiosInstance.patch<UpdateWatchedResponse>(
    API_ENDPOINTS.watchlistById(id),
    { watched },
  );
  return response.data;
}
