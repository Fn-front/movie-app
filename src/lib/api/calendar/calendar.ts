/**
 * カレンダーAPI クライアント
 */

import { API_ENDPOINTS } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';

/**
 * カレンダー映画アイテムの型
 */
export interface CalendarMovieItem {
  /** ウォッチリストID */
  id: string;
  /** TMDb映画ID */
  tmdb_movie_id: number;
  /** 映画タイトル */
  title: string;
  /** ポスター画像パス */
  poster_path: string | null;
  /** 公開日 */
  release_date: string;
  /** 追加日時 */
  added_at: string;
}

/**
 * カレンダー取得リクエストの型
 */
export interface GetCalendarRequest {
  month?: string;
}

/**
 * カレンダー取得レスポンスの型
 */
export interface GetCalendarResponse {
  success: true;
  data: {
    month: string;
    movies_by_date: Record<string, CalendarMovieItem[]>;
  };
}

/**
 * カレンダーの映画を月別に取得
 *
 * @param params - クエリパラメータ
 * @returns カレンダーレスポンス
 */
export async function getCalendarMovies(
  params: GetCalendarRequest = {},
): Promise<GetCalendarResponse> {
  const response = await axiosInstance.get<GetCalendarResponse>(
    API_ENDPOINTS.WATCHLIST_CALENDAR,
    { params },
  );
  return response.data;
}
