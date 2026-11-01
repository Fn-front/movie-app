/**
 * 指定年の視聴済み一覧API
 * GET /api/watchlist/watched - 追加年を指定して視聴済みを取得（一括削除の確認用）
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  ERROR_CODE,
  WATCHLIST_SELECT,
  WATCHLIST_ERROR_MESSAGES,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { withAuth } from '@/helpers/routeHandler';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { watchlistWatchedQuerySchema } from '@/schema/watchlist';
import { getJstYearRange } from '@/utils/date';

export const GET = withAuth(
  async ({ session, supabase, request }) => {
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

    const { searchParams } = new URL(request.url);
    const queryResult = watchlistWatchedQuerySchema.safeParse({
      year: searchParams.get('year') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!queryResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: WATCHLIST_ERROR_MESSAGES.INVALID_QUERY,
            details: queryResult.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 一覧ページ（get_watchlist_sorted）と同じオフセットページング。
    // cursor の数値化と負数チェックはスキーマ側に寄せている
    const { year, cursor: offset, limit } = queryResult.data;

    // 年の境界は JST。UTC のまま切ると 1/1 早朝に追加した行が前年に落ちる
    const { start, end } = getJstYearRange(year);

    // withAuth は service role クライアントを使うため RLS は効かない。
    // 他ユーザーの行を守るのは user_id 条件だけなので必ず付ける
    const { data, count, error } = await supabase
      .from('watchlist')
      .select(WATCHLIST_SELECT, { count: 'exact' })
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .not('watched_at', 'is', null)
      .gte('added_at', start)
      .lt('added_at', end)
      .order('added_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    const totalCount = count ?? 0;
    const hasMore = offset + limit < totalCount;

    return NextResponse.json(
      {
        success: true,
        data: {
          watchlist: data ?? [],
          next_cursor: hasMore ? String(offset + limit) : null,
          has_more: hasMore,
        },
      },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Watchlist watched fetch error',
    errorMessage: WATCHLIST_ERROR_MESSAGES.FETCH_FAILED,
  },
);
