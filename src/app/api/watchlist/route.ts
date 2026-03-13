/**
 * ウォッチリストAPI
 * GET /api/watchlist - ウォッチリスト一覧取得（カーソルベースページング）
 * POST /api/watchlist - ウォッチリストに追加
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { watchlistQuerySchema, watchlistAddSchema } from '@/schema/watchlist';
import type { WatchlistItem } from '@/lib/api/watchlist/watchlist';
import {
  HTTP_STATUS,
  ERROR_CODE,
  WATCHLIST_ERROR_MESSAGES,
  WATCHLIST_SUCCESS_MESSAGES,
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
      const { data, error } = await supabase.rpc('get_watchlist_by_proximity', {
        p_user_id: session.user.id,
        p_limit: limit,
        p_offset: cursor ? parseInt(cursor, 10) : 0,
      });

      if (error) {
        throw error;
      }

      const items = (data ?? []) as Array<WatchlistItem & { total_count: number }>;
      const totalCount = items.length > 0 ? items[0].total_count : 0;
      const offset = cursor ? parseInt(cursor, 10) : 0;
      const hasMore = offset + limit < totalCount;
      const nextCursor = hasMore ? String(offset + limit) : null;

      // total_count をレスポンスから除外
      const watchlist = items.map(({ total_count: _, ...item }) => item);

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
  } catch (error) {
    console.error('Watchlist fetch error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: WATCHLIST_ERROR_MESSAGES.FETCH_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}

export async function POST(request: Request) {
  try {
    // 認証チェック
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    // Supabaseクライアント検証
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // リクエストボディのパース
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.BAD_REQUEST,
            message: WATCHLIST_ERROR_MESSAGES.INVALID_BODY,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // バリデーション
    const result = watchlistAddSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: WATCHLIST_ERROR_MESSAGES.INVALID_BODY,
            details: result.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 重複チェック（deleted_at IS NULLの条件はUNIQUEインデックスで保証）
    const { data: existing } = await supabase
      .from('watchlist')
      .select('id')
      .eq('user_id', session.user.id)
      .eq('tmdb_movie_id', result.data.tmdb_movie_id)
      .is('deleted_at', null)
      .single();

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.CONFLICT,
            message: WATCHLIST_ERROR_MESSAGES.ALREADY_EXISTS,
          },
        },
        { status: HTTP_STATUS.CONFLICT },
      );
    }

    // ウォッチリストに追加
    const { data: inserted, error: insertError } = await supabase
      .from('watchlist')
      .insert({
        user_id: session.user.id,
        tmdb_movie_id: result.data.tmdb_movie_id,
        title: result.data.title,
        poster_path: result.data.poster_path ?? null,
        release_date: result.data.release_date ?? null,
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
  } catch (error) {
    console.error('Watchlist add error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: WATCHLIST_ERROR_MESSAGES.ADD_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
