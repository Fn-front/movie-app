/**
 * ウォッチリストAPI
 * GET /api/watchlist - ウォッチリスト一覧取得（カーソルベースページング）
 * POST /api/watchlist - ウォッチリストに追加
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  ERROR_CODE,
  WATCHLIST_ERROR_MESSAGES,
  WATCHLIST_SUCCESS_MESSAGES,
} from '@/constants';
import { checkDuplicate, conflictResponse } from '@/helpers/apiHelpers';
import { parseAndValidate } from '@/helpers/requestValidation';
import { withAuth } from '@/helpers/routeHandler';
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

    const { cursor, limit, sort } = queryResult.data;

    if (sort === 'release_date_proximity') {
      // 公開日が今日に近い順（ABS(release_date - NOW())昇順、NULLは末尾）
      // Supabase SDKではカスタムORDERが使えないためRPCまたはraw SQLを使用
      const offset = cursor ? parseInt(cursor, 10) : 0;

      if (Number.isNaN(offset)) {
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

      const { data, error } = await supabase.rpc('get_watchlist_by_proximity', {
        p_user_id: session.user.id,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) {
        throw error;
      }

      const items = (data ?? []) as Array<
        WatchlistItem & { total_count: number }
      >;
      const totalCount = items.length > 0 ? items[0].total_count : 0;
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
    }

    // デフォルト: 追加日順（既存ロジック）
    let query = supabase
      .from('watchlist')
      .select('id, tmdb_movie_id, title, poster_path, release_date, added_at')
      .eq('user_id', session.user.id)
      .is('deleted_at', null);

    if (cursor) {
      query = query.lt('added_at', cursor);
    }

    const { data, error } = await query
      .order('added_at', { ascending: false })
      .limit(limit + 1);

    if (error) {
      throw error;
    }

    const items = data ?? [];
    const hasMore = items.length > limit;
    const watchlist = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore
      ? watchlist[watchlist.length - 1].added_at
      : null;

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
      .select('id, tmdb_movie_id, title, poster_path, release_date, added_at')
      .single();

    if (insertError) {
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
