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
 */
function parseGenreIds(genre: string): number[] {
  return genre
    .split(',')
    .map(Number)
    .filter((id) => !isNaN(id) && id > 0);
}

/**
 * サーバー側フィルタリング（キーワード検索 + フィルター併用時）
 */
function filterMovies(
  movies: Movie[],
  options: {
    genreIds?: number[];
    year?: number;
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

    // 年代フィルター: release_dateの年と一致するか
    if (options.year !== undefined) {
      const releaseYear = movie.release_date
        ? new Date(movie.release_date).getFullYear()
        : null;
      if (releaseYear !== options.year) return false;
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

    const hasFilters =
      genre !== undefined ||
      year !== undefined ||
      vote_average_gte !== undefined;
    const genreIds = genre ? parseGenreIds(genre) : undefined;

    let result: TMDbResponse<Movie>;

    if (query) {
      // パターン1: キーワード検索（+ サーバー側フィルタリング）
      result = await searchMovies({ query, page });

      if (hasFilters) {
        const filteredMovies = filterMovies(result.results, {
          genreIds,
          year,
          voteAverageGte: vote_average_gte,
        });

        result = {
          ...result,
          results: filteredMovies,
          total_results: filteredMovies.length,
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
          },
        },
      },
      { status: HTTP_STATUS.OK },
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
