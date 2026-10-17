/**
 * レコメンド利用イベント記録API
 * POST /api/recommendations/events
 *
 * 表示・クリック・ウォッチリスト追加・興味なし を記録し、
 * CTR やウォッチリスト追加率の算出に使う。
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
  RECOMMENDATION_EVENTS_MESSAGES,
} from '@/constants';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { parseAndValidate } from '@/helpers/requestValidation';
import { withAuth } from '@/helpers/routeHandler';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { recommendationEventsPostSchema } from '@/schema/recommendations';

export const POST = withAuth(
  async ({ session, supabase, request }) => {
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.WRITE_RECOMMENDATION_EVENTS,
      RATE_LIMIT_CONFIG.WRITE_RECOMMENDATION_EVENTS.maxAttempts,
      RATE_LIMIT_CONFIG.WRITE_RECOMMENDATION_EVENTS.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    const parsed = await parseAndValidate(
      request,
      recommendationEventsPostSchema,
      RECOMMENDATION_EVENTS_MESSAGES.INVALID_BODY,
    );

    if (parsed.error) return parsed.error;

    // 同一ユーザー・同一レコメンド・同一種別は1件に抑える。
    // 表示イベントはスクロールや再訪のたびに送られてくるため、
    // 重複はエラーにせず黙って無視する（計測の都合でユーザー操作は妨げない）。
    const { error } = await supabase.from('recommendation_events').upsert(
      parsed.data.events.map((event) => ({
        user_id: session.user.id,
        recommendation_id: event.recommendation_id,
        tmdb_movie_id: event.tmdb_movie_id,
        event_type: event.event_type,
      })),
      {
        onConflict: 'user_id,recommendation_id,event_type',
        ignoreDuplicates: true,
      },
    );

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { success: true, data: { recorded: parsed.data.events.length } },
      { status: HTTP_STATUS.CREATED },
    );
  },
  {
    errorLog: 'Recommendation event record error',
    errorMessage: RECOMMENDATION_EVENTS_MESSAGES.RECORD_FAILED,
  },
);
