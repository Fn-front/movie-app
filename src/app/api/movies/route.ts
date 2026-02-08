/**
 * 映画一覧API
 * GET /api/movies?page=1&sort_by=release_date
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { moviesQuerySchema } from '@/schema/movies';
import {
  HTTP_STATUS,
  PAGINATION,
  CACHE_DURATION_HOURS,
  MOVIES_FETCH_MONTHS_AHEAD,
} from '@/constants';
import { discoverMovies } from '@/lib/tmdb/tmdb';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * ソートカラムのマッピング
 */
const SORT_COLUMN_MAP: Record<string, string> = {
  release_date: 'release_date',
  popularity: 'popularity',
  vote_average: 'vote_average',
};

/**
 * 日付をYYYY-MM-DD形式にフォーマット
 */
function formatDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function GET(request: Request) {
  try {
    // Supabaseクライアント検証
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_ERROR',
            message: 'データベース接続に失敗しました。',
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // クエリパラメータのバリデーション
    const { searchParams } = new URL(request.url);
    const queryResult = moviesQuerySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      sort_by: searchParams.get('sort_by') ?? undefined,
    });

    if (!queryResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'クエリパラメータが不正です。',
            details: queryResult.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const { page, sort_by } = queryResult.data;

    // DBからMAX(cached_at)を取得してキャッシュの鮮度を確認
    const { data: cacheInfo } = await supabase
      .from('movie_cache')
      .select('cached_at')
      .order('cached_at', { ascending: false })
      .limit(1)
      .single();

    const now = new Date();
    const cacheExpired =
      !cacheInfo ||
      now.getTime() - new Date(cacheInfo.cached_at).getTime() >
        CACHE_DURATION_HOURS * 60 * 60 * 1000;

    // キャッシュが古い or 存在しない場合、TMDb APIから取得
    if (cacheExpired) {
      const today = formatDateToString(now);
      const futureDate = new Date(now);
      futureDate.setMonth(futureDate.getMonth() + MOVIES_FETCH_MONTHS_AHEAD);
      const futureDateStr = formatDateToString(futureDate);

      // TMDb discover APIで映画を取得（最大5ページ）
      const maxPages = 5;
      for (let p = 1; p <= maxPages; p++) {
        const tmdbResponse = await discoverMovies({
          page: p,
          'primary_release_date.gte': today,
          'primary_release_date.lte': futureDateStr,
          sort_by: 'popularity.desc',
        });

        if (tmdbResponse.results.length === 0) break;

        // UPSERTでmovie_cacheに保存
        const movieRows = tmdbResponse.results.map((movie) => ({
          id: movie.id,
          title: movie.title,
          poster_path: movie.poster_path,
          backdrop_path: movie.backdrop_path,
          release_date: movie.release_date || null,
          overview: movie.overview || null,
          vote_average: movie.vote_average,
          popularity: movie.popularity,
          genre_ids: movie.genre_ids,
          cached_at: now.toISOString(),
        }));

        await supabase.from('movie_cache').upsert(movieRows, {
          onConflict: 'id',
        });

        if (p >= tmdbResponse.total_pages) break;
      }
    }

    // DBからソート順で映画を取得
    const sortColumn = SORT_COLUMN_MAP[sort_by] || 'release_date';
    const ascending = sort_by === 'release_date';
    const offset = (page - 1) * PAGINATION.ITEMS_PER_PAGE;

    // 総件数を取得
    const { count: totalItems } = await supabase
      .from('movie_cache')
      .select('id', { count: 'exact', head: true });

    // ページ分のデータを取得
    const { data: movies, error: fetchError } = await supabase
      .from('movie_cache')
      .select('*')
      .order(sortColumn, { ascending, nullsFirst: false })
      .range(offset, offset + PAGINATION.ITEMS_PER_PAGE - 1);

    if (fetchError) {
      throw fetchError;
    }

    const total = totalItems ?? 0;
    const totalPages = Math.ceil(total / PAGINATION.ITEMS_PER_PAGE);

    return NextResponse.json(
      {
        success: true,
        data: {
          movies: movies ?? [],
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: total,
            itemsPerPage: PAGINATION.ITEMS_PER_PAGE,
          },
        },
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Movies fetch error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: '映画データの取得中にエラーが発生しました。',
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
