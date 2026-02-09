/**
 * 映画一覧API
 * GET /api/movies?page=1&sort_by=release_date&release_type=theatrical&genre_ids=28,12
 */

import { NextResponse } from 'next/server';

import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { moviesQuerySchema } from '@/schema/movies';
import {
  HTTP_STATUS,
  PAGINATION,
  CACHE_DURATION_HOURS,
  MOVIES_FETCH_MONTHS_AHEAD,
  RELEASE_TYPE_MAP,
  EXCLUDED_KEYWORDS_PARAM,
  EXCLUDED_LANGUAGES,
  MOVIES_ERROR_MESSAGES,
} from '@/constants';
import { discoverMovies, getGenres } from '@/lib/tmdb/tmdb';

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

/**
 * ジャンルキャッシュ（module-level、1日有効）
 */
let genreCache: { data: Record<number, string>; cachedAt: number } | null =
  null;
const GENRE_CACHE_DURATION = 24 * 60 * 60 * 1000;

/**
 * ジャンルマップを取得（キャッシュ付き）
 */
async function getGenreMap(): Promise<Record<number, string>> {
  const now = Date.now();

  if (genreCache && now - genreCache.cachedAt < GENRE_CACHE_DURATION) {
    return genreCache.data;
  }

  const genres: { id: number; name: string }[] = await getGenres();
  const genreMap: Record<number, string> = {};
  for (const genre of genres) {
    genreMap[genre.id] = genre.name;
  }

  genreCache = { data: genreMap, cachedAt: now };
  return genreMap;
}

export async function GET(request: Request) {
  try {
    // Supabaseクライアント検証
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // クエリパラメータのバリデーション
    const { searchParams } = new URL(request.url);
    const queryResult = moviesQuerySchema.safeParse({
      page: searchParams.get('page') ?? undefined,
      sort_by: searchParams.get('sort_by') ?? undefined,
      release_type: searchParams.get('release_type') ?? undefined,
      genre_ids: searchParams.get('genre_ids') ?? undefined,
      release_date_gte: searchParams.get('release_date_gte') ?? undefined,
      release_date_lte: searchParams.get('release_date_lte') ?? undefined,
      is_revival: searchParams.get('is_revival') ?? undefined,
    });

    if (!queryResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: MOVIES_ERROR_MESSAGES.INVALID_QUERY,
            details: queryResult.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const {
      page,
      sort_by,
      release_type,
      genre_ids,
      release_date_gte,
      release_date_lte,
      is_revival,
    } = queryResult.data;

    // ジャンルマップを取得
    const genreMap = await getGenreMap();

    // DBからrelease_type別のMAX(cached_at)を取得してキャッシュの鮮度を確認
    const { data: cacheInfo } = await supabase
      .from('movie_cache')
      .select('cached_at')
      .eq('release_type', release_type)
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

      const withReleaseType = RELEASE_TYPE_MAP[release_type] || '2|3';

      // TMDb discover APIで映画を取得（最大5ページ）
      const maxPages = 5;
      for (let p = 1; p <= maxPages; p++) {
        const tmdbResponse = await discoverMovies({
          page: p,
          'release_date.gte': today,
          'release_date.lte': futureDateStr,
          with_release_type: withReleaseType,
          sort_by: 'popularity.desc',
          without_keywords: EXCLUDED_KEYWORDS_PARAM,
        });

        if (tmdbResponse.results.length === 0) break;

        // adultコンテンツ・除外言語を除外
        const excludedLangs: readonly string[] = EXCLUDED_LANGUAGES;
        const filteredResults = tmdbResponse.results.filter(
          (movie) =>
            !movie.adult && !excludedLangs.includes(movie.original_language),
        );

        if (filteredResults.length === 0) continue;

        // UPSERTでmovie_cacheに保存
        const movieRows = filteredResults.map((movie) => ({
          id: movie.id,
          title: movie.title,
          poster_path: movie.poster_path,
          backdrop_path: movie.backdrop_path,
          release_date: movie.release_date || null,
          overview: movie.overview || null,
          vote_average: movie.vote_average,
          popularity: movie.popularity,
          genre_ids: movie.genre_ids,
          release_type,
          cached_at: now.toISOString(),
        }));

        await supabase.from('movie_cache').upsert(movieRows, {
          onConflict: 'id,release_type',
        });

        if (p >= tmdbResponse.total_pages) break;
      }
    }

    // DBからソート順で映画を取得
    const sortColumn = SORT_COLUMN_MAP[sort_by] || 'release_date';
    const ascending = sort_by === 'release_date';
    const offset = (page - 1) * PAGINATION.ITEMS_PER_PAGE;

    // genre_idsのパース
    const genreIdArray = genre_ids
      ? genre_ids
          .split(',')
          .map(Number)
          .filter((id) => !isNaN(id) && id > 0)
      : [];

    // 過去日除外: release_date_gteが指定されている場合は大きい方を使用
    const today = formatDateToString(new Date());
    const effectiveDateGte =
      release_date_gte && release_date_gte > today ? release_date_gte : today;

    // 総件数を取得（release_type + genre_ids + 日付 + リバイバルフィルタ適用）
    let countQuery = supabase
      .from('movie_cache')
      .select('id', { count: 'exact', head: true })
      .eq('release_type', release_type)
      .gte('release_date', effectiveDateGte);

    if (release_date_lte) {
      countQuery = countQuery.lte('release_date', release_date_lte);
    }

    if (is_revival !== undefined) {
      countQuery = countQuery.eq('is_revival', is_revival);
    }

    if (genreIdArray.length > 0) {
      const orConditions = genreIdArray
        .map((id) => `genre_ids.cs.[${id}]`)
        .join(',');
      countQuery = countQuery.or(orConditions);
    }

    const { count: totalItems } = await countQuery;

    // ページ分のデータを取得（release_type + genre_ids + 日付 + リバイバルフィルタ適用）
    let dataQuery = supabase
      .from('movie_cache')
      .select('*')
      .eq('release_type', release_type)
      .gte('release_date', effectiveDateGte)
      .order(sortColumn, { ascending, nullsFirst: false })
      .range(offset, offset + PAGINATION.ITEMS_PER_PAGE - 1);

    if (release_date_lte) {
      dataQuery = dataQuery.lte('release_date', release_date_lte);
    }

    if (is_revival !== undefined) {
      dataQuery = dataQuery.eq('is_revival', is_revival);
    }

    if (genreIdArray.length > 0) {
      const orConditions = genreIdArray
        .map((id) => `genre_ids.cs.[${id}]`)
        .join(',');
      dataQuery = dataQuery.or(orConditions);
    }

    const { data: movies, error: fetchError } = await dataQuery;

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
          genres: genreMap,
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
          message: MOVIES_ERROR_MESSAGES.FETCH_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
