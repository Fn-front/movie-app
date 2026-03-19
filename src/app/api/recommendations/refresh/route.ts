/**
 * レコメンド手動更新API
 * POST /api/recommendations/refresh
 *
 * 認証済みユーザーのレコメンドを即時再生成する。
 * 月10回の回数制限あり。
 */

import { NextResponse } from 'next/server';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  HTTP_STATUS,
  RECOMMENDATION_REFRESH,
  RECOMMENDATION_REFRESH_MESSAGES,
  RECOMMENDATION_REFRESH_ERROR_CODE,
} from '@/constants';
import { withAuth } from '@/helpers/routeHandler';
import { processUserRecommendations } from '@/lib/recommendations/generateRecommendationsService';
import type { Recommendation } from '@/schema/recommendations';

export const maxDuration = 120;

/**
 * 当月の更新回数を取得
 */
async function getMonthlyRefreshCount(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('recommendation_refreshes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', getMonthStart());

  if (error) {
    throw error;
  }

  return count ?? 0;
}

/**
 * 当月1日 0:00 UTCのISO文字列を返す
 */
function getMonthStart(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

export const POST = withAuth(
  async ({ session, supabase }) => {
    const usedCount = await getMonthlyRefreshCount(supabase, session.user.id);

    if (usedCount >= RECOMMENDATION_REFRESH.MAX_COUNT) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: RECOMMENDATION_REFRESH_ERROR_CODE.LIMIT_EXCEEDED,
            message: RECOMMENDATION_REFRESH_MESSAGES.LIMIT_EXCEEDED,
          },
        },
        { status: HTTP_STATUS.TOO_MANY_REQUESTS },
      );
    }

    const { error: insertError } = await supabase
      .from('recommendation_refreshes')
      .insert({ user_id: session.user.id });

    if (insertError) {
      throw insertError;
    }

    const result = await processUserRecommendations(supabase, session.user.id);

    if (result.status === 'skipped') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'GENERATION_FAILED',
            message: RECOMMENDATION_REFRESH_MESSAGES.GENERATION_FAILED,
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
      );
    }

    const { data: recommendations } = await supabase
      .from('recommendations')
      .select(
        'id, tmdb_movie_id, title, poster_path, release_date, vote_average, genre_ids, reason, display_order',
      )
      .eq('user_id', session.user.id)
      .order('display_order', { ascending: true });

    const remainingCount =
      RECOMMENDATION_REFRESH.MAX_COUNT - (usedCount + 1);

    return NextResponse.json(
      {
        success: true,
        data: {
          remainingCount,
          recommendations: (recommendations ?? []) as Recommendation[],
        },
      },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Recommendation refresh error',
    errorMessage: RECOMMENDATION_REFRESH_MESSAGES.GENERATION_FAILED,
  },
);
