/**
 * ジャンル一覧API
 * GET /api/movies/genres
 */

import { NextResponse } from 'next/server';

import { getGenres } from '@/lib/tmdb/tmdb';
import {
  HTTP_STATUS,
  ERROR_CODE,
  SEARCH_ERROR_MESSAGES,
  GENRE_NAME_OVERRIDES,
  CACHE_CONTROL,
} from '@/constants';

export async function GET() {
  try {
    const rawGenres: { id: number; name: string }[] = await getGenres();
    const genres = rawGenres.map((genre) => ({
      ...genre,
      name: GENRE_NAME_OVERRIDES[genre.name] ?? genre.name,
    }));

    return NextResponse.json(
      {
        success: true,
        data: {
          genres,
        },
      },
      {
        status: HTTP_STATUS.OK,
        headers: {
          'Cache-Control': CACHE_CONTROL.PUBLIC_7D,
        },
      },
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
