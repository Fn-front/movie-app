/**
 * ジャンル一覧API
 * GET /api/movies/genres
 */

import { NextResponse } from 'next/server';

import { toSelectableGenres } from '@/lib/movies/genreFilter';
import { getGenres } from '@/lib/tmdb/tmdb';
import { enforcePublicRateLimit } from '@/helpers/publicRateLimit';
import {
  HTTP_STATUS,
  ERROR_CODE,
  SEARCH_ERROR_MESSAGES,
  GENRE_NAME_OVERRIDES,
  CACHE_CONTROL,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';

export async function GET(request: Request) {
  try {
    // getGenres() は in-process キャッシュを持たず毎回 TMDb を叩く。
    // PUBLIC_7D は同一URLのCDNキャッシュに過ぎず、クエリを付ければ素通りする
    const limited = await enforcePublicRateLimit({
      request,
      action: RATE_LIMIT_ACTION.READ_GENRES,
      limit: RATE_LIMIT_CONFIG.READ_GENRES,
    });
    if (limited) return limited;

    const rawGenres: { id: number; name: string }[] = await getGenres();
    // 保存前フィルタで弾いているジャンルは、選んでも必ず0件になるため出さない
    const genres = toSelectableGenres(rawGenres).map((genre) => ({
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
