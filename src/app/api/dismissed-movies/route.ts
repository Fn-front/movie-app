/**
 * 興味なし映画API
 * GET /api/dismissed-movies - 興味なし一覧取得
 * POST /api/dismissed-movies - 興味なしに追加
 * DELETE /api/dismissed-movies - 興味なしから削除
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  ERROR_CODE,
  DISMISSED_MOVIES_SELECT,
  DISMISSED_MOVIES_ERROR_MESSAGES,
  DISMISSED_MOVIES_SUCCESS_MESSAGES,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import {
  checkDuplicate,
  conflictResponse,
  rateLimitExceededResponse,
} from '@/helpers/apiHelpers';
import { parseAndValidate } from '@/helpers/requestValidation';
import { withAuth } from '@/helpers/routeHandler';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { dismissedMoviesAddSchema } from '@/schema/dismissedMovies';

export const GET = withAuth(
  async ({ session, supabase }) => {
    const { data, error } = await supabase
      .from('dismissed_movies')
      .select(DISMISSED_MOVIES_SELECT)
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
  },
  {
    errorLog: 'Dismissed movies fetch error',
    errorMessage: DISMISSED_MOVIES_ERROR_MESSAGES.FETCH_FAILED,
  },
);

export const POST = withAuth(
  async ({ session, supabase, request }) => {
    // レート制限チェック
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.WRITE_DISMISSED_MOVIES,
      RATE_LIMIT_CONFIG.WRITE_DISMISSED_MOVIES.maxAttempts,
      RATE_LIMIT_CONFIG.WRITE_DISMISSED_MOVIES.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    const parsed = await parseAndValidate(
      request,
      dismissedMoviesAddSchema,
      DISMISSED_MOVIES_ERROR_MESSAGES.INVALID_BODY,
    );

    if (parsed.error) return parsed.error;

    const isDuplicate = await checkDuplicate(
      supabase,
      'dismissed_movies',
      session.user.id,
      parsed.data.tmdb_movie_id,
    );

    if (isDuplicate) {
      return conflictResponse(DISMISSED_MOVIES_ERROR_MESSAGES.ALREADY_EXISTS);
    }

    const { data: inserted, error: insertError } = await supabase
      .from('dismissed_movies')
      .insert({
        user_id: session.user.id,
        tmdb_movie_id: parsed.data.tmdb_movie_id,
        title: parsed.data.title,
        poster_path: parsed.data.poster_path ?? null,
        genre_ids: parsed.data.genre_ids ?? null,
      })
      .select(DISMISSED_MOVIES_SELECT)
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
  },
  {
    errorLog: 'Dismissed movie add error',
    errorMessage: DISMISSED_MOVIES_ERROR_MESSAGES.ADD_FAILED,
  },
);

export const DELETE = withAuth(
  async ({ session, supabase, request }) => {
    // レート制限チェック
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.WRITE_DISMISSED_MOVIES,
      RATE_LIMIT_CONFIG.WRITE_DISMISSED_MOVIES.maxAttempts,
      RATE_LIMIT_CONFIG.WRITE_DISMISSED_MOVIES.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

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
  },
  {
    errorLog: 'Dismissed movie remove error',
    errorMessage: DISMISSED_MOVIES_ERROR_MESSAGES.REMOVE_FAILED,
  },
);
