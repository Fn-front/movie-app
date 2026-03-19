/**
 * レコメンド更新回数取得API
 * GET /api/recommendations/refresh-count
 *
 * 当月の使用回数・残り回数を返す。
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  RECOMMENDATION_REFRESH,
  RECOMMENDATION_REFRESH_MESSAGES,
} from '@/constants';
import { withAuth } from '@/helpers/routeHandler';

export const GET = withAuth(
  async ({ session, supabase }) => {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();

    const { count, error } = await supabase
      .from('recommendation_refreshes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .gte('created_at', monthStart);

    if (error) {
      throw error;
    }

    const usedCount = count ?? 0;
    const maxCount = RECOMMENDATION_REFRESH.MAX_COUNT;
    const remainingCount = Math.max(0, maxCount - usedCount);

    return NextResponse.json(
      {
        success: true,
        data: {
          usedCount,
          maxCount,
          remainingCount,
        },
      },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Recommendation refresh count error',
    errorMessage: RECOMMENDATION_REFRESH_MESSAGES.FETCH_COUNT_FAILED,
  },
);
