/**
 * 映画一覧API
 * GET /api/movies?time_frame=upcoming&page=1&sort_by=release_date&release_type=theatrical&genre_ids=28,12
 * GET /api/movies?time_frame=now_showing&page=1&sort_by=release_date&release_type=theatrical
 */

import { NextResponse } from 'next/server';

import { getAuthSession } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { moviesQuerySchema } from '@/schema/movies';
import {
  HTTP_STATUS,
  PAGINATION,
  CACHE_DURATION_HOURS,
  NOW_PLAYING_CACHE_DURATION_HOURS,
  MOVIES_FETCH_MONTHS_AHEAD,
  NOW_SHOWING_MONTHS_BACK,
  RELEASE_TYPE_MAP,
  EXCLUDED_KEYWORDS_PARAM,
  EXCLUDED_GENRES_PARAM,
  ALLOWED_LANGUAGES,
  MIN_VOTE_AVERAGE,
  MIN_POPULARITY,
  MOVIES_ERROR_MESSAGES,
  ERROR_CODE,
  GENRE_CACHE_DURATION_MS,
  DISCOVER_API_MAX_PAGES,
  GENRE_NAME_OVERRIDES,
} from '@/constants';
import { discoverMovies, getGenres } from '@/lib/tmdb/tmdb';
import { syncNowPlayingMovies } from '@/lib/sync/syncNowPlayingMovies';

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

/**
 * ジャンルマップを取得（キャッシュ付き）
 */
async function getGenreMap(): Promise<Record<number, string>> {
  const now = Date.now();

  if (genreCache && now - genreCache.cachedAt < GENRE_CACHE_DURATION_MS) {
    return genreCache.data;
  }

  const genres: { id: number; name: string }[] = await getGenres();
  const genreMap: Record<number, string> = {};
  for (const genre of genres) {
    genreMap[genre.id] = GENRE_NAME_OVERRIDES[genre.name] ?? genre.name;
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
      sort_order: searchParams.get('sort_order') ?? undefined,
      release_type: searchParams.get('release_type') ?? undefined,
      time_frame: searchParams.get('time_frame') ?? undefined,
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
            code: ERROR_CODE.VALIDATION_ERROR,
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
      sort_order,
      release_type,
      time_frame,
      genre_ids,
      release_date_gte,
      release_date_lte,
      is_revival,
    } = queryResult.data;

    // ジャンルマップを取得
    const genreMap = await getGenreMap();

    const now = new Date();
    const isNowPlayingTheatrical =
      time_frame === 'now_showing' && release_type === 'theatrical';

    if (isNowPlayingTheatrical) {
      // now_showing + theatrical: is_now_playing フラグでフィルタ
      // キャッシュ鮮度チェック（is_now_playing=true のレコードの cached_at を確認）
      const { data: cacheInfo } = await supabase
        .from('movie_cache')
        .select('cached_at')
        .eq('is_now_playing', true)
        .eq('release_type', 'theatrical')
        .order('cached_at', { ascending: false })
        .limit(1)
        .single();

      const nowPlayingCacheExpired =
        !cacheInfo ||
        now.getTime() - new Date(cacheInfo.cached_at).getTime() >
          NOW_PLAYING_CACHE_DURATION_HOURS * 60 * 60 * 1000;

      // キャッシュが古い or 存在しない場合、オンデマンドで同期実行
      if (nowPlayingCacheExpired) {
        await syncNowPlayingMovies();
      }
    } else {
      // 従来のDiscover APIロジック
      const { data: cacheInfo } = await supabase
        .from('movie_cache')
        .select('cached_at')
        .eq('release_type', release_type)
        .order('cached_at', { ascending: false })
        .limit(1)
        .single();

      const cacheExpired =
        !cacheInfo ||
        now.getTime() - new Date(cacheInfo.cached_at).getTime() >
          CACHE_DURATION_HOURS * 60 * 60 * 1000;

      // キャッシュが古い or 存在しない場合、TMDb APIから取得
      if (cacheExpired) {
        const today = formatDateToString(now);

        // time_frameに応じて日付範囲を決定
        let fetchDateGte: string;
        let fetchDateLte: string;

        if (time_frame === 'now_showing') {
          // streaming の now_showing
          const pastDate = new Date(now);
          pastDate.setMonth(pastDate.getMonth() - NOW_SHOWING_MONTHS_BACK);
          fetchDateGte = formatDateToString(pastDate);
          fetchDateLte = today;
        } else {
          fetchDateGte = today;
          const futureDate = new Date(now);
          futureDate.setMonth(
            futureDate.getMonth() + MOVIES_FETCH_MONTHS_AHEAD,
          );
          fetchDateLte = formatDateToString(futureDate);
        }

        const withReleaseType =
          RELEASE_TYPE_MAP[release_type] || RELEASE_TYPE_MAP.theatrical;

        // 別のrelease_typeで既に存在するIDを取得（重複防止）
        const { data: existingOtherType } = await supabase
          .from('movie_cache')
          .select('id')
          .neq('release_type', release_type);

        const existingOtherTypeIds = new Set(
          (existingOtherType ?? []).map((row: { id: number }) => row.id),
        );

        // TMDb discover APIで映画を取得
        for (let p = 1; p <= DISCOVER_API_MAX_PAGES; p++) {
          const tmdbResponse = await discoverMovies({
            page: p,
            'release_date.gte': fetchDateGte,
            'release_date.lte': fetchDateLte,
            with_release_type: withReleaseType,
            sort_by: 'popularity.desc',
            without_keywords: EXCLUDED_KEYWORDS_PARAM,
            without_genres: EXCLUDED_GENRES_PARAM,
          });

          if (tmdbResponse.results.length === 0) break;

          // adultコンテンツ・除外言語・別release_typeで既存の映画・低品質コンテンツを除外
          const allowedLangs: readonly string[] = ALLOWED_LANGUAGES;
          const filteredResults = tmdbResponse.results.filter(
            (movie) =>
              !movie.adult &&
              allowedLangs.includes(movie.original_language) &&
              !existingOtherTypeIds.has(movie.id) &&
              movie.genre_ids &&
              movie.genre_ids.length > 0 &&
              (movie.vote_average === 0 ||
                movie.vote_average >= MIN_VOTE_AVERAGE) &&
              movie.popularity >= MIN_POPULARITY,
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
    }

    // DBからソート順で映画を取得
    const sortColumn = SORT_COLUMN_MAP[sort_by] || 'release_date';
    // sort_order指定時はそれに従う。未指定時はrelease_dateのみ昇順
    const ascending = sort_order
      ? sort_order === 'asc'
      : sort_by === 'release_date';
    const offset = (page - 1) * PAGINATION.ITEMS_PER_PAGE;

    // genre_idsのパース
    const genreIdArray = genre_ids
      ? genre_ids
          .split(',')
          .map(Number)
          .filter((id) => !isNaN(id) && id > 0)
      : [];

    // time_frameに応じたDBクエリの日付範囲を決定
    const today = formatDateToString(new Date());

    // 総件数クエリを構築
    let countQuery = supabase
      .from('movie_cache')
      .select('id', { count: 'exact', head: true })
      .eq('release_type', release_type);

    // データクエリを構築
    let dataQuery = supabase
      .from('movie_cache')
      .select('*')
      .eq('release_type', release_type)
      .order(sortColumn, { ascending, nullsFirst: false })
      .order('id', { ascending: true })
      .range(offset, offset + PAGINATION.ITEMS_PER_PAGE - 1);

    if (isNowPlayingTheatrical) {
      // now_showing + theatrical: is_now_playing フラグでフィルタ（日付範囲なし）
      countQuery = countQuery.eq('is_now_playing', true);
      dataQuery = dataQuery.eq('is_now_playing', true);

      // ユーザー指定の日付範囲があれば追加フィルタとして適用
      if (release_date_gte) {
        countQuery = countQuery.gte('release_date', release_date_gte);
        dataQuery = dataQuery.gte('release_date', release_date_gte);
      }
      if (release_date_lte) {
        countQuery = countQuery.lte('release_date', release_date_lte);
        dataQuery = dataQuery.lte('release_date', release_date_lte);
      }
    } else {
      // 従来の日付範囲フィルタロジック
      let effectiveDateGte: string;
      let effectiveDateLte: string | undefined;

      if (time_frame === 'now_showing') {
        // streaming の now_showing
        const pastDate = new Date();
        pastDate.setMonth(pastDate.getMonth() - NOW_SHOWING_MONTHS_BACK);
        const defaultGte = formatDateToString(pastDate);
        effectiveDateGte =
          release_date_gte && release_date_gte > defaultGte
            ? release_date_gte
            : defaultGte;
        effectiveDateLte = release_date_lte || today;
      } else {
        effectiveDateGte =
          release_date_gte && release_date_gte > today
            ? release_date_gte
            : today;
        effectiveDateLte = release_date_lte;
      }

      countQuery = countQuery.gte('release_date', effectiveDateGte);
      dataQuery = dataQuery.gte('release_date', effectiveDateGte);

      if (effectiveDateLte) {
        countQuery = countQuery.lte('release_date', effectiveDateLte);
        dataQuery = dataQuery.lte('release_date', effectiveDateLte);
      }
    }

    if (is_revival !== undefined) {
      countQuery = countQuery.eq('is_revival', is_revival);
      dataQuery = dataQuery.eq('is_revival', is_revival);
    }

    if (genreIdArray.length > 0) {
      const orConditions = genreIdArray
        .map((id) => `genre_ids.cs.[${id}]`)
        .join(',');
      countQuery = countQuery.or(orConditions);
      dataQuery = dataQuery.or(orConditions);
    }

    const { count: totalItems } = await countQuery;
    const { data: movies, error: fetchError } = await dataQuery;

    if (fetchError) {
      throw fetchError;
    }

    const total = totalItems ?? 0;
    const totalPages = Math.ceil(total / PAGINATION.ITEMS_PER_PAGE);

    const hasNextPage = page < totalPages;

    // 認証済みの場合、お気に入り情報を付与
    const session = await getAuthSession();
    let moviesWithFavorites = movies ?? [];

    if (session && moviesWithFavorites.length > 0) {
      const movieIds = moviesWithFavorites.map((m: { id: number }) => m.id);

      const { data: favorites } = await supabase
        .from('favorites')
        .select('id, tmdb_movie_id, rating')
        .eq('user_id', session.user.id)
        .in('tmdb_movie_id', movieIds)
        .is('deleted_at', null);

      if (favorites && favorites.length > 0) {
        const favoriteMap = new Map(
          favorites.map(
            (f: { id: string; tmdb_movie_id: number; rating: number }) => [
              f.tmdb_movie_id,
              { id: f.id, rating: f.rating },
            ],
          ),
        );

        moviesWithFavorites = moviesWithFavorites.map(
          (movie: { id: number }) => ({
            ...movie,
            favorite: favoriteMap.get(movie.id) ?? null,
          }),
        );
      } else {
        moviesWithFavorites = moviesWithFavorites.map(
          (movie: { id: number }) => ({
            ...movie,
            favorite: null,
          }),
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          movies: moviesWithFavorites,
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: total,
            itemsPerPage: PAGINATION.ITEMS_PER_PAGE,
            hasNextPage,
            nextPage: hasNextPage ? page + 1 : null,
          },
          genres: genreMap,
        },
      },
      {
        status: HTTP_STATUS.OK,
        headers: {
          'Cache-Control': session
            ? 'private, no-store'
            : 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    );
  } catch (error) {
    console.error('Movies fetch error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: MOVIES_ERROR_MESSAGES.FETCH_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
