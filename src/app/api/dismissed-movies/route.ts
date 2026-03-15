/**
 * 興味なし映画API
 * GET /api/dismissed-movies - 興味なし一覧取得
 * POST /api/dismissed-movies - 興味なしに追加
 * DELETE /api/dismissed-movies - 興味なしから削除
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { dismissedMoviesAddSchema } from '@/schema/dismissedMovies';
import {
  HTTP_STATUS,
  ERROR_CODE,
  DISMISSED_MOVIES_ERROR_MESSAGES,
  DISMISSED_MOVIES_SUCCESS_MESSAGES,
} from '@/constants';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    const { data, error } = await supabase
      .from('dismissed_movies')
      .select('id, tmdb_movie_id, title, poster_path, genre_ids, created_at')
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json(
      { success: true, data: data ?? [] },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Dismissed movies fetch error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: DISMISSED_MOVIES_ERROR_MESSAGES.FETCH_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.BAD_REQUEST,
            message: DISMISSED_MOVIES_ERROR_MESSAGES.INVALID_BODY,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const result = dismissedMoviesAddSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: DISMISSED_MOVIES_ERROR_MESSAGES.INVALID_BODY,
            details: result.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 重複チェック
    const { data: existing } = await supabase
      .from('dismissed_movies')
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
            message: DISMISSED_MOVIES_ERROR_MESSAGES.ALREADY_EXISTS,
          },
        },
        { status: HTTP_STATUS.CONFLICT },
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from('dismissed_movies')
      .insert({
        user_id: session.user.id,
        tmdb_movie_id: result.data.tmdb_movie_id,
        title: result.data.title,
        genre_ids: result.data.genre_ids ?? null,
      })
      .select('id, tmdb_movie_id, title, genre_ids, created_at')
      .single();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json(
      {
        success: true,
        message: DISMISSED_MOVIES_SUCCESS_MESSAGES.ADDED,
        data: inserted,
      },
      { status: HTTP_STATUS.CREATED },
    );
  } catch (error) {
    console.error('Dismissed movie add error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: DISMISSED_MOVIES_ERROR_MESSAGES.ADD_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    const { searchParams } = new URL(request.url);
    const tmdbMovieId = searchParams.get('tmdb_movie_id');

    if (!tmdbMovieId || isNaN(Number(tmdbMovieId))) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.BAD_REQUEST,
            message: DISMISSED_MOVIES_ERROR_MESSAGES.INVALID_BODY,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const { error: updateError } = await supabase
      .from('dismissed_movies')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
      .eq('tmdb_movie_id', Number(tmdbMovieId))
      .is('deleted_at', null);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json(
      {
        success: true,
        message: DISMISSED_MOVIES_SUCCESS_MESSAGES.REMOVED,
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Dismissed movie remove error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: DISMISSED_MOVIES_ERROR_MESSAGES.REMOVE_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
