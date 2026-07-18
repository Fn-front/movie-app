/**
 * カレンダーAPI
 * GET /api/watchlist/calendar - ウォッチリストの映画を月別に取得
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { calendarQuerySchema } from '@/schema/calendar';
import {
  HTTP_STATUS,
  ERROR_CODE,
  CALENDAR_ERROR_MESSAGES,
  WATCHLIST_SELECT,
} from '@/constants';

export async function GET(request: Request) {
  try {
    // 認証チェック
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    // Supabaseクライアント検証
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // クエリパラメータのバリデーション
    const { searchParams } = new URL(request.url);
    const queryResult = calendarQuerySchema.safeParse({
      month: searchParams.get('month') ?? undefined,
    });

    if (!queryResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: CALENDAR_ERROR_MESSAGES.INVALID_QUERY,
            details: queryResult.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 月の範囲を計算（デフォルト: 当月）
    const now = new Date();
    const monthStr =
      queryResult.data.month ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [yearStr, monthNumStr] = monthStr.split('-');
    const year = Number(yearStr);
    const monthNum = Number(monthNumStr);

    const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const endDate =
      monthNum === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(monthNum + 1).padStart(2, '0')}-01`;

    // ウォッチリストから指定月の映画を取得
    const { data, error } = await supabase
      .from('watchlist')
      .select(WATCHLIST_SELECT)
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .not('release_date', 'is', null)
      .gte('release_date', startDate)
      .lt('release_date', endDate)
      .order('release_date', { ascending: true });

    if (error) {
      throw error;
    }

    // 日付をキーとしたマップ形式に変換
    const moviesByDate: Record<
      string,
      Array<{
        id: string;
        tmdb_movie_id: number;
        title: string;
        poster_path: string | null;
        release_date: string;
        added_at: string;
      }>
    > = {};

    for (const item of data ?? []) {
      if (!item.release_date) continue;
      const date = item.release_date;
      if (!moviesByDate[date]) {
        moviesByDate[date] = [];
      }
      moviesByDate[date].push({
        id: item.id,
        tmdb_movie_id: item.tmdb_movie_id,
        title: item.title,
        poster_path: item.poster_path,
        release_date: date,
        added_at: item.added_at,
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          month: monthStr,
          movies_by_date: moviesByDate,
        },
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Calendar fetch error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: CALENDAR_ERROR_MESSAGES.FETCH_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
