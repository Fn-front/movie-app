/**
 * お気に入りAPI
 * GET /api/favorites - お気に入り一覧取得（ページベースページング）
 * POST /api/favorites - お気に入りに追加
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { favoritesQuerySchema, favoritesAddSchema } from '@/schema/favorites';
import {
  HTTP_STATUS,
  ERROR_CODE,
  FAVORITES_ERROR_MESSAGES,
  FAVORITES_SUCCESS_MESSAGES,
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
    const queryResult = favoritesQuerySchema.safeParse({
      sort_by: searchParams.get('sort_by') ?? undefined,
      sort_order: searchParams.get('sort_order') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!queryResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: FAVORITES_ERROR_MESSAGES.INVALID_QUERY,
            details: queryResult.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const { sort_by, sort_order, page, limit } = queryResult.data;

    // 件数取得
    const { count, error: countError } = await supabase
      .from('favorites')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .is('deleted_at', null);

    if (countError) {
      throw countError;
    }

    const total = count ?? 0;

    // お気に入り取得（ページベースページング）
    const offset = (page - 1) * limit;

    const { data, error } = await supabase
      .from('favorites')
      .select(
        'id, tmdb_movie_id, title, poster_path, release_date, rating, added_at',
      )
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .order(sort_by, { ascending: sort_order === 'asc' })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;

    return NextResponse.json(
      {
        success: true,
        data: {
          favorites: data ?? [],
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: total,
            itemsPerPage: limit,
            hasNextPage,
            nextPage: hasNextPage ? page + 1 : null,
          },
        },
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Favorites fetch error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: FAVORITES_ERROR_MESSAGES.FETCH_FAILED,
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
            message: FAVORITES_ERROR_MESSAGES.INVALID_BODY,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // バリデーション
    const result = favoritesAddSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: FAVORITES_ERROR_MESSAGES.INVALID_BODY,
            details: result.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 重複チェック
    const { data: existing } = await supabase
      .from('favorites')
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
            message: FAVORITES_ERROR_MESSAGES.ALREADY_EXISTS,
          },
        },
        { status: HTTP_STATUS.CONFLICT },
      );
    }

    // お気に入りに追加
    const { data: inserted, error: insertError } = await supabase
      .from('favorites')
      .insert({
        user_id: session.user.id,
        tmdb_movie_id: result.data.tmdb_movie_id,
        title: result.data.title,
        poster_path: result.data.poster_path ?? null,
        release_date: result.data.release_date ?? null,
        rating: result.data.rating,
      })
      .select(
        'id, tmdb_movie_id, title, poster_path, release_date, rating, added_at',
      )
      .single();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json(
      {
        success: true,
        message: FAVORITES_SUCCESS_MESSAGES.ADDED,
        data: inserted,
      },
      { status: HTTP_STATUS.CREATED },
    );
  } catch (error) {
    console.error('Favorites add error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: FAVORITES_ERROR_MESSAGES.ADD_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
