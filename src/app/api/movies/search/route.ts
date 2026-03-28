/**
 * 映画検索API
 * GET /api/movies/search?query=xxx&page=1&genre=28,12&year=2024&vote_average_gte=7.0
 *
 * パターン1: キーワードあり → TMDb /search/movie → サーバー側フィルタリング
 * パターン2: キーワードなし + フィルターあり → TMDb /discover/movie
 * パターン3: キーワードなし + フィルターなし → 400エラー
 */

import { NextResponse } from 'next/server';

import { searchMovies, discoverMovies } from '@/lib/tmdb/tmdb';
import type { Movie, TMDbResponse } from '@/lib/types';
import { searchQuerySchema } from '@/schema/search';
import { HTTP_STATUS, ERROR_CODE, SEARCH_ERROR_MESSAGES } from '@/constants';

/**
 * ジャンルIDをパースしてnumber配列に変換
 * zodスキーマで /^\d+(,\d+)*$/ バリデーション済みのため、不正値は到達しない
 */
function parseGenreIds(genre: string): number[] {
  return genre.split(',').map(Number);
}

/**
 * サーバー側フィルタリング（キーワード検索 + フィルター併用時）
 */
function filterMovies(
  movies: Movie[],
  options: {
    genreIds?: number[];
    voteAverageGte?: number;
  },
): Movie[] {
  return movies.filter((movie) => {
    // ジャンルフィルター: 指定ジャンルIDのいずれかが含まれているか
    if (options.genreIds && options.genreIds.length > 0) {
      const hasMatchingGenre = options.genreIds.some((id) =>
        movie.genre_ids.includes(id),
      );
      if (!hasMatchingGenre) return false;
    }

    // 評価フィルター: vote_averageが閾値以上か
    if (options.voteAverageGte !== undefined) {
      if (movie.vote_average < options.voteAverageGte) return false;
    }

    return true;
  });
}

export async function GET(request: Request) {
  try {
    // クエリパラメータのバリデーション
    const { searchParams } = new URL(request.url);
    const queryResult = searchQuerySchema.safeParse({
      query: searchParams.get('query') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      genre: searchParams.get('genre') ?? undefined,
      year: searchParams.get('year') ?? undefined,
      vote_average_gte: searchParams.get('vote_average_gte') ?? undefined,
    });

    if (!queryResult.success) {
      // refineのエラー（検索条件なし）かフィールドエラーかを判定
      const formErrors = queryResult.error.flatten();
      const isNoSearchCriteria = formErrors.formErrors.length > 0;

      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: isNoSearchCriteria
              ? SEARCH_ERROR_MESSAGES.NO_SEARCH_CRITERIA
              : SEARCH_ERROR_MESSAGES.VALIDATION_ERROR,
            details: isNoSearchCriteria ? undefined : formErrors.fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const { query, page, genre, year, vote_average_gte } = queryResult.data;

    const genreIds = genre ? parseGenreIds(genre) : undefined;

    let result: TMDbResponse<Movie>;

    // サーバー側フィルタリングが適用されたかどうか
    let isServerFiltered = false;

    if (query) {
      // パターン1: キーワード検索（+ サーバー側フィルタリング）
      // TMDb /search/movie は year パラメータをサポートしているためAPI側に渡す
      result = await searchMovies({ query, page, year });

      // genre・vote_average_gte はTMDb /search/movieが非対応のためサーバー側でフィルタリング
      const needsServerFilter =
        (genreIds && genreIds.length > 0) || vote_average_gte !== undefined;

      if (needsServerFilter) {
        const filteredMovies = filterMovies(result.results, {
          genreIds,
          voteAverageGte: vote_average_gte,
        });

        isServerFiltered = true;
        result = {
          ...result,
          results: filteredMovies,
          // サーバー側フィルタリングにより1ページ分の件数のみ。正確な総件数は不明
          total_results: filteredMovies.length,
          total_pages: 1,
        };
      }
    } else {
      // パターン2: フィルターのみ検索（Discover API）
      result = await discoverMovies({
        page,
        with_genres: genreIds?.join(','),
        primary_release_year: year,
        'vote_average.gte': vote_average_gte,
        sort_by: 'popularity.desc',
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          movies: result.results,
          pagination: {
            page: result.page,
            totalPages: result.total_pages,
            totalResults: result.total_results,
            isServerFiltered,
          },
        },
      },
      {
        status: HTTP_STATUS.OK,
        headers: {
          'Cache-Control':
            'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    );
  } catch (error) {
    console.error('Movie search error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: SEARCH_ERROR_MESSAGES.FETCH_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
