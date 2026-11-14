/**
 * ウォッチリストAPI クライアント
 */

import { API_ENDPOINTS } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';
import type {
  WatchlistAddFormData,
  WatchlistBulkDeleteFormData,
  WatchlistSortOption,
} from '@/schema/watchlist';

/**
 * ウォッチリストアイテムの配信情報
 */
export interface WatchlistStreaming {
  /** 提供形態。見放題とレンタルの両方で観られる場合は flatrate を返す */
  offer_type: 'flatrate' | 'paid';
  /** 表示するプロバイダーID（代表IDへ正規化済み） */
  provider_ids: number[];
  /** 一度途切れたあとの再配信か */
  resumed: boolean;
}

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
  /** 配信情報。配信されていなければ null */
  streaming: WatchlistStreaming | null;
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
  /** 配信中の未視聴を先頭に出すか（一覧ページのみ） */
  prioritize_streaming?: boolean;
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
 * ウォッチリスト照会アイテムの型
 *
 * 「登録済みか・どの行か」の判定に必要な列だけを持つ軽量版。
 */
export interface WatchlistLookupItem {
  /** ウォッチリストID（削除に使う） */
  id: string;
  /** TMDb映画ID */
  tmdb_movie_id: number;
}

/**
 * ウォッチリスト照会レスポンスの型
 */
export interface GetWatchlistLookupResponse {
  success: true;
  data: {
    watchlist: WatchlistLookupItem[];
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
 * ウォッチリストの照会用データ（ID・映画ID）を全件取得
 *
 * ページングしない。理由は `src/app/api/watchlist/lookup/route.ts` を参照。
 *
 * @returns ウォッチリスト照会レスポンス
 */
export async function getWatchlistLookup(): Promise<GetWatchlistLookupResponse> {
  const response = await axiosInstance.get<GetWatchlistLookupResponse>(
    API_ENDPOINTS.WATCHLIST_LOOKUP,
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

/**
 * 視聴済みがある追加年の型
 */
export interface WatchlistWatchedYear {
  /** 追加年（JST） */
  year: number;
  /** その年の視聴済み件数 */
  count: number;
  /**
   * そのうちお気に入りに登録されていない件数
   *
   * 削除すると観たという記録が残らない作品の数。読み込み済みの行から数えると
   * 無限スクロールの進み具合で変わるため、サーバーが年全体で数えた値を使う。
   */
  unrated_count: number;
}

/**
 * 追加年一覧取得レスポンスの型
 */
export interface GetWatchlistWatchedYearsResponse {
  success: true;
  data: {
    years: WatchlistWatchedYear[];
  };
}

/**
 * 指定年の視聴済み一覧取得リクエストの型
 */
export interface GetWatchlistWatchedRequest {
  /** 追加年（JST） */
  year: number;
  /** ページングカーソル（オフセット） */
  cursor?: string;
  /** 1ページあたりの取得件数 */
  limit?: number;
}

/**
 * 一括削除の対象アイテムの型
 *
 * 一覧の `WatchlistItem` に、お気に入り登録の有無を足したもの。
 * 未登録の作品は削除すると観たという記録が残らないため、モーダルで印を付ける。
 */
export interface WatchlistWatchedItem extends WatchlistItem {
  /** お気に入りに登録されているか */
  has_favorite: boolean;
}

/**
 * 指定年の視聴済み一覧取得レスポンスの型
 */
export interface GetWatchlistWatchedResponse {
  success: true;
  data: {
    watchlist: WatchlistWatchedItem[];
    next_cursor: string | null;
    has_more: boolean;
  };
}

/**
 * 一括削除レスポンスの型
 */
export interface BulkDeleteWatchlistResponse {
  success: true;
  message: string;
  data: {
    deleted_count: number;
  };
}

/**
 * 視聴済みがある追加年の一覧を取得
 *
 * @returns 追加年と件数の一覧（降順）
 */
export async function getWatchlistWatchedYears(): Promise<GetWatchlistWatchedYearsResponse> {
  const response = await axiosInstance.get<GetWatchlistWatchedYearsResponse>(
    API_ENDPOINTS.WATCHLIST_WATCHED_YEARS,
  );
  return response.data;
}

/**
 * 指定した追加年の視聴済み一覧を取得
 *
 * @param params - 年とページングパラメータ
 * @returns ウォッチリスト一覧レスポンス（一覧APIと同じ形）
 */
export async function getWatchlistWatched(
  params: GetWatchlistWatchedRequest,
): Promise<GetWatchlistWatchedResponse> {
  const response = await axiosInstance.get<GetWatchlistWatchedResponse>(
    API_ENDPOINTS.WATCHLIST_WATCHED,
    { params },
  );
  return response.data;
}

/**
 * 指定した追加年の視聴済みをまとめて削除
 *
 * @param data - 年と除外ID（除外IDが空ならその年の視聴済み全件）
 * @returns 削除件数を含むレスポンス
 */
export async function bulkDeleteWatchlist(
  data: WatchlistBulkDeleteFormData,
): Promise<BulkDeleteWatchlistResponse> {
  const response = await axiosInstance.post<BulkDeleteWatchlistResponse>(
    API_ENDPOINTS.WATCHLIST_BULK_DELETE,
    data,
  );
  return response.data;
}
