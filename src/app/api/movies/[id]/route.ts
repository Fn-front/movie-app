/**
 * 映画詳細API
 * GET /api/movies/:id
 * キャッシュなし、都度TMDb API取得
 */

import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';

import { getAuthSession } from '@/helpers/auth';
import { createServiceRoleClient } from '@/helpers/supabase';
import { getMovieDetail } from '@/lib/tmdb/tmdb';
import {
  HTTP_STATUS,
  ERROR_CODE,
  MOVIES_ERROR_MESSAGES,
  API_ERROR_MESSAGES,
} from '@/constants';

/**
 * 映画詳細を取得
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const movieId = Number(id);

    if (Number.isNaN(movieId) || movieId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: MOVIES_ERROR_MESSAGES.INVALID_MOVIE_ID,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const movie = await getMovieDetail(movieId);

    // 認証済みの場合、お気に入り情報を付与
    let favorite = undefined;
    const session = await getAuthSession();

    if (session) {
      const supabase = createServiceRoleClient();

      if (supabase) {
        const { data: favoriteData } = await supabase
          .from('favorites')
          .select('id, rating')
          .eq('user_id', session.user.id)
          .eq('tmdb_movie_id', movieId)
          .is('deleted_at', null)
          .single();

        favorite = favoriteData ?? null;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...movie,
        ...(favorite !== undefined ? { favorite } : {}),
      },
    });
  } catch (error) {
    if (
      isAxiosError(error) &&
      error.response?.status === HTTP_STATUS.NOT_FOUND
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.NOT_FOUND,
            message: MOVIES_ERROR_MESSAGES.NOT_FOUND,
          },
        },
        { status: HTTP_STATUS.NOT_FOUND },
      );
    }

    console.error('映画詳細取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: API_ERROR_MESSAGES.SERVER_ERROR,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
