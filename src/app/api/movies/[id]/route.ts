/**
 * 映画詳細API
 * GET /api/movies/:id
 * キャッシュなし、都度TMDb API取得
 */

import { NextResponse } from 'next/server';

import { getMovieDetail } from '@/lib/tmdb/tmdb';
import { HTTP_STATUS, ERROR_CODE } from '@/constants';

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
            message: '映画IDが不正です',
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
    const isNotFound =
      error instanceof Error &&
      'response' in error &&
      (error as { response?: { status?: number } }).response?.status === 404;

    if (isNotFound) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: '映画が見つかりません',
          },
        },
        { status: 404 },
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
