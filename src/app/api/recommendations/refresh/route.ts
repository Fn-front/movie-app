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
  RATE_LIMIT_ACTION,
  RECOMMENDATION_REFRESH,
  RECOMMENDATION_REFRESH_MESSAGES,
  RECOMMENDATION_REFRESH_ERROR_CODE,
} from '@/constants';
import { withAuth } from '@/helpers/routeHandler';
import { checkCooldown } from '@/lib/rateLimit/rateLimit';
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
  async ({ session, supabase, request }) => {
    // 連打防止のクールダウン。
    // 試行時点で記録されるため、生成完了前の多重リクエストもここで止まる
    // （recommendation_refreshes の行は生成成功後にしか作られないため、
    //   そちらの時刻だけでは in-flight の連打を防げない）。
    const cooldownResult = await checkCooldown(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.RECOMMENDATION_REFRESH,
      RECOMMENDATION_REFRESH.SERVER_COOLDOWN_SECONDS,
    );

    if (!cooldownResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: RECOMMENDATION_REFRESH_ERROR_CODE.COOLDOWN,
            message: RECOMMENDATION_REFRESH_MESSAGES.COOLDOWN,
          },
        },
        {
          status: HTTP_STATUS.TOO_MANY_REQUESTS,
          headers: cooldownResult.retryAfter
            ? { 'Retry-After': String(cooldownResult.retryAfter) }
            : undefined,
        },
      );
    }

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

    // 回数の「予約」を先に取る。
    // 生成成功後に記録する方式では、クライアントが離脱して200を受け取れなくても
    // サーバーは完走して回数だけ減るため、UI上は「失敗」なのに残回数が減る齟齬が出る。
    // 先に枠を確保し、生成が成立しなかった場合だけ取り消すことで、
    // 「abortを繰り返して回数を消費せず生成させる」抜け穴も同時に塞ぐ。
    const { data: reservation, error: reserveError } = await supabase
      .from('recommendation_refreshes')
      .insert({ user_id: session.user.id })
      .select('id')
      .single();

    if (reserveError || !reservation) {
      throw reserveError ?? new Error('Failed to reserve refresh count');
    }

    /** 予約した回数枠を取り消す（生成が成立しなかった場合） */
    const releaseReservation = async () => {
      const { error } = await supabase
        .from('recommendation_refreshes')
        .delete()
        .eq('id', reservation.id);

      if (error) {
        console.error('Failed to release refresh reservation:', error);
      }
    };

    let result;
    try {
      result = await processUserRecommendations(
        supabase,
        session.user.id,
        request.signal,
      );
    } catch (error) {
      await releaseReservation();
      throw error;
    }

    if (result.status === 'skipped') {
      await releaseReservation();

      return NextResponse.json(
        {
          success: false,
          error: {
            code: RECOMMENDATION_REFRESH_ERROR_CODE.GENERATION_FAILED,
            message: RECOMMENDATION_REFRESH_MESSAGES.GENERATION_FAILED,
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
      );
    }

    const { data: recommendations } = await supabase
      .from('recommendations')
      .select(
        'id, tmdb_movie_id, title, poster_path, release_date, vote_average, vote_count, genre_ids, reason, display_order',
      )
      .eq('user_id', session.user.id)
      .order('display_order', { ascending: true });

    const remainingCount = RECOMMENDATION_REFRESH.MAX_COUNT - (usedCount + 1);

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
