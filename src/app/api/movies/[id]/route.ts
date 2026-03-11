/**
 * 映画詳細API
 * GET /api/movies/:id
 * キャッシュなし、都度TMDb API取得
 */

import { NextResponse } from 'next/server';
import { isAxiosError } from 'axios';

import { getMovieDetail } from '@/lib/tmdb/tmdb';
import { HTTP_STATUS, ERROR_CODE, MOVIES_ERROR_MESSAGES } from '@/constants';

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

    return NextResponse.json({
      success: true,
      data: movie,
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
          message: 'サーバーエラーが発生しました',
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
