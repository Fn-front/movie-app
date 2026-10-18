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

    // 送られてきた recommendation_id が本当に自分のレコメンドかを確認する。
    //
    // user_id はセッションから固定しているので他人の行は作れないが、
    // recommendation_id と tmdb_movie_id はクライアントの申告値のままだった。
    // 外部キーも張っていない（洗い替えで連鎖削除されると時系列を追えなくなるため
    // 意図的にそうしている）ので、ここで確認しないと任意のUUIDで
    // click / add_to_watchlist を投入でき、CTR 等の集計値を汚染できる。
    const requestedIds = [
      ...new Set(parsed.data.events.map((event) => event.recommendation_id)),
    ];

    const { data: ownedRows, error: ownedError } = await supabase
      .from('recommendations')
      .select('id, tmdb_movie_id')
      .eq('user_id', session.user.id)
      .in('id', requestedIds);

    if (ownedError) {
      throw ownedError;
    }

    /** 自分のレコメンドID → サーバー側が持つ tmdb_movie_id */
    const ownedMovieIdById = new Map(
      (ownedRows ?? []).map((row) => [
        row.id as string,
        row.tmdb_movie_id as number,
      ]),
    );

    // 自分のものでないイベントは**静かに捨てる**。
    // レコメンドは日次CRON・手動更新・初回お気に入り時の即時生成の3経路で
    // 洗い替えられ、そのたびにIDが再採番される。洗い替え直後に古いIDの
    // impression が届くのは正常系なので、エラーにすると計測の都合で
    // ユーザー操作を妨げてしまう。
    const rows = parsed.data.events
      .filter((event) => ownedMovieIdById.has(event.recommendation_id))
      .map((event) => ({
        user_id: session.user.id,
        recommendation_id: event.recommendation_id,
        // クライアントの申告値ではなくサーバー側の値を正とする
        tmdb_movie_id: ownedMovieIdById.get(event.recommendation_id)!,
        event_type: event.event_type,
      }));

    // 全件落ちた場合は upsert に空配列を渡さない（PostgREST がエラーにする）
    if (rows.length > 0) {
      // 同一ユーザー・同一レコメンド・同一種別は1件に抑える。
      // 表示イベントはスクロールや再訪のたびに送られてくるため、
      // 重複はエラーにせず黙って無視する（計測の都合でユーザー操作は妨げない）。
      const { error } = await supabase
        .from('recommendation_events')
        .upsert(rows, {
          onConflict: 'user_id,recommendation_id,event_type',
          ignoreDuplicates: true,
        });

      if (error) {
        throw error;
      }
    }

    return NextResponse.json(
      { success: true, data: { recorded: rows.length } },
      { status: HTTP_STATUS.CREATED },
    );
  },
  {
    errorLog: 'Recommendation event record error',
    errorMessage: RECOMMENDATION_EVENTS_MESSAGES.RECORD_FAILED,
  },
);
