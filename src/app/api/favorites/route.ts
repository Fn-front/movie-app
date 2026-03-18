/**
 * お気に入りAPI
 * GET /api/favorites - お気に入り一覧取得（ページベースページング）
 * POST /api/favorites - お気に入りに追加
 */

import { NextResponse } from 'next/server';

import { withAuth } from '@/helpers/routeHandler';
import { parseAndValidate } from '@/helpers/requestValidation';
import { checkDuplicate, conflictResponse } from '@/helpers/apiHelpers';
import { favoritesQuerySchema, favoritesAddSchema } from '@/schema/favorites';
import {
  HTTP_STATUS,
  ERROR_CODE,
  FAVORITES_ERROR_MESSAGES,
  FAVORITES_SUCCESS_MESSAGES,
} from '@/constants';

export const GET = withAuth(
  async ({ session, supabase, request }) => {
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
  },
  {
    errorLog: 'Favorites fetch error',
    errorMessage: FAVORITES_ERROR_MESSAGES.FETCH_FAILED,
  },
);

export const POST = withAuth(
  async ({ session, supabase, request }) => {
    const parsed = await parseAndValidate(
      request,
      favoritesAddSchema,
      FAVORITES_ERROR_MESSAGES.INVALID_BODY,
    );
    if (parsed.error) return parsed.error;

    // 重複チェック
    const isDuplicate = await checkDuplicate(
      supabase,
      'favorites',
      session.user.id,
      parsed.data.tmdb_movie_id,
    );
    if (isDuplicate) {
      return conflictResponse(FAVORITES_ERROR_MESSAGES.ALREADY_EXISTS);
    }

    // お気に入りに追加
    const { data: inserted, error: insertError } = await supabase
      .from('favorites')
      .insert({
        user_id: session.user.id,
        tmdb_movie_id: parsed.data.tmdb_movie_id,
        title: parsed.data.title,
        poster_path: parsed.data.poster_path ?? null,
        release_date: parsed.data.release_date ?? null,
        rating: parsed.data.rating,
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
  },
  {
    errorLog: 'Favorites add error',
    errorMessage: FAVORITES_ERROR_MESSAGES.ADD_FAILED,
  },
);
