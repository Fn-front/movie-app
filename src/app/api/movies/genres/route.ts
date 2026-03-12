/**
 * ジャンル一覧API
 * GET /api/movies/genres
 */

import { NextResponse } from 'next/server';

import { getGenres } from '@/lib/tmdb/tmdb';
import { HTTP_STATUS, ERROR_CODE, SEARCH_ERROR_MESSAGES } from '@/constants';

export async function GET() {
  try {
    const genres: { id: number; name: string }[] = await getGenres();

    return NextResponse.json(
      {
        success: true,
        data: {
          genres,
        },
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Genres fetch error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: SEARCH_ERROR_MESSAGES.GENRES_FETCH_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
