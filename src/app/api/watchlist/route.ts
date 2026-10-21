/**
 * ウォッチリストAPI
 * GET /api/watchlist - ウォッチリスト一覧取得（カーソルベースページング）
 * POST /api/watchlist - ウォッチリストに追加
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  ERROR_CODE,
  WATCHLIST_SELECT,
  WATCHLIST_ERROR_MESSAGES,
  WATCHLIST_SUCCESS_MESSAGES,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import {
  checkDuplicate,
  conflictResponse,
  isUniqueViolation,
  rateLimitExceededResponse,
} from '@/helpers/apiHelpers';
import { parseAndValidate } from '@/helpers/requestValidation';
import { withAuth } from '@/helpers/routeHandler';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import type { WatchlistItem } from '@/lib/api/watchlist/watchlist';
import { watchlistQuerySchema, watchlistAddSchema } from '@/schema/watchlist';

export const GET = withAuth(
  async ({ session, supabase, request }) => {
    // クエリパラメータのバリデーション
    const { searchParams } = new URL(request.url);
    const queryResult = watchlistQuerySchema.safeParse({
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      sort: searchParams.get('sort') ?? undefined,
      exclude_watched: searchParams.get('exclude_watched') ?? undefined,
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

    const { cursor, limit, sort, exclude_watched } = queryResult.data;

    // 並び替えは get_watchlist_sorted（RPC）に一本化している。
    // 視聴済みを最下部に送ると並び順の主キーが watched_at になり、
    // added_at だけのキーセットカーソルでは次ページの境界を表せないため、
    // 両ソートともオフセットページングにそろえた。
    const offset = cursor ? Number.parseInt(cursor, 10) : 0;

    if (Number.isNaN(offset) || offset < 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: WATCHLIST_ERROR_MESSAGES.INVALID_QUERY,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const { data, error } = await supabase.rpc('get_watchlist_sorted', {
      p_user_id: session.user.id,
      p_sort: sort,
      p_limit: limit,
      p_offset: offset,
      p_exclude_watched: exclude_watched,
    });

    if (error) {
      throw error;
    }

    const items = (data ?? []) as Array<
      WatchlistItem & { total_count: number }
    >;
    const totalCount = items.length > 0 ? Number(items[0].total_count) : 0;
    const hasMore = offset + limit < totalCount;
    const nextCursor = hasMore ? String(offset + limit) : null;

    // total_count をレスポンスから除外
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const watchlist = items.map(({ total_count, ...item }) => item);

    return NextResponse.json(
      {
        success: true,
        data: {
          watchlist,
          next_cursor: nextCursor,
          has_more: hasMore,
        },
      },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Watchlist fetch error',
    errorMessage: WATCHLIST_ERROR_MESSAGES.FETCH_FAILED,
  },
);

export const POST = withAuth(
  async ({ session, supabase, request }) => {
    // レート制限チェック
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.WRITE_WATCHLIST,
      RATE_LIMIT_CONFIG.WRITE_WATCHLIST.maxAttempts,
      RATE_LIMIT_CONFIG.WRITE_WATCHLIST.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    // リクエストボディのパース + バリデーション
    const parsed = await parseAndValidate(
      request,
      watchlistAddSchema,
      WATCHLIST_ERROR_MESSAGES.INVALID_BODY,
    );
    if (parsed.error) return parsed.error;

    // 重複チェック（deleted_at IS NULLの条件はUNIQUEインデックスで保証）
    const isDuplicate = await checkDuplicate(
      supabase,
      'watchlist',
      session.user.id,
      parsed.data.tmdb_movie_id,
    );

    if (isDuplicate) {
      return conflictResponse(WATCHLIST_ERROR_MESSAGES.ALREADY_EXISTS);
    }

    // ウォッチリストに追加
    const { data: inserted, error: insertError } = await supabase
      .from('watchlist')
      .insert({
        user_id: session.user.id,
        tmdb_movie_id: parsed.data.tmdb_movie_id,
        title: parsed.data.title,
        poster_path: parsed.data.poster_path ?? null,
        release_date: parsed.data.release_date ?? null,
      })
      .select(WATCHLIST_SELECT)
      .single();

    if (insertError) {
      if (isUniqueViolation(insertError)) {
        return conflictResponse(WATCHLIST_ERROR_MESSAGES.ALREADY_EXISTS);
      }
      throw insertError;
    }

    return NextResponse.json(
      {
        success: true,
        message: WATCHLIST_SUCCESS_MESSAGES.ADDED,
        data: inserted,
      },
      { status: HTTP_STATUS.CREATED },
    );
  },
  {
    errorLog: 'Watchlist add error',
    errorMessage: WATCHLIST_ERROR_MESSAGES.ADD_FAILED,
  },
);
