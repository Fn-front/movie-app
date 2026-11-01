/**
 * 視聴済みの追加年一覧API
 * GET /api/watchlist/watched-years - 視聴済みがある追加年と件数を取得
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  WATCHLIST_ERROR_MESSAGES,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { withAuth } from '@/helpers/routeHandler';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';

/** RPC の戻り行 */
interface WatchedYearRow {
  added_year: number;
  watched_count: number;
  /** そのうちお気に入りに登録されていない件数 */
  unrated_count: number;
}

export const GET = withAuth(
  async ({ session, supabase }) => {
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.READ_USER_DATA,
      RATE_LIMIT_CONFIG.READ_USER_DATA.maxAttempts,
      RATE_LIMIT_CONFIG.READ_USER_DATA.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    // 年ごとの集計は PostgREST で表現できないため RPC に寄せている。
    // 年の境界は RPC 内で Asia/Tokyo に揃えている
    const { data, error } = await supabase.rpc('get_watchlist_watched_years', {
      p_user_id: session.user.id,
    });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as WatchedYearRow[];

    return NextResponse.json(
      {
        success: true,
        data: {
          years: rows.map((row) => ({
            year: Number(row.added_year),
            count: Number(row.watched_count),
            unrated_count: Number(row.unrated_count),
          })),
        },
      },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Watchlist watched years fetch error',
    errorMessage: WATCHLIST_ERROR_MESSAGES.YEARS_FETCH_FAILED,
  },
);
