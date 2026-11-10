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
import { enforcePublicRateLimit } from '@/helpers/publicRateLimit';
import {
  HTTP_STATUS,
  ERROR_CODE,
  SEARCH_ERROR_MESSAGES,
  CACHE_CONTROL,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';

/**
 * サーバー側フィルタリング（キーワード検索 + フィルター併用時）
 */
function filterMovies(
  movies: Movie[],
  options: {
    genreIds?: number[];
    voteAverageGte?: number;
    releaseDateGte?: string;
    releaseDateLte?: string;
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

    // 公開期間フィルター（#997）
    //
    // ⚠️ ここで見るのは `movie.release_date`＝TMDbの**代表公開日**。
    // Discover の `release_date.gte/lte`（いずれかの国のリリースで一致）
    // とは意味が違い、キーワード検索では代表日しか手元に無い。
    // 同じ期間を指定しても2つの経路で結果が一致しない場合がある。
    //
    // 代表日が無い作品は期間を指定した時点で候補から外す（判定できないため）
    if (
      options.releaseDateGte !== undefined ||
      options.releaseDateLte !== undefined
    ) {
      if (!movie.release_date) return false;
      if (
        options.releaseDateGte !== undefined &&
        movie.release_date < options.releaseDateGte
      ) {
        return false;
      }
      if (
        options.releaseDateLte !== undefined &&
        movie.release_date > options.releaseDateLte
      ) {
        return false;
      }
    }

    return true;
  });
}

export async function GET(request: Request) {
  try {
    // 未認証で叩ける＝サーバーの TMDB_API_KEY を使った無認証プロキシになるため、
    // 送信元単位で上限を掛ける。認証判定は行わない（JWT検証のコストを
    // 高頻度の公開ルートに持ち込まないため、識別子は常に送信元）
    const limited = await enforcePublicRateLimit({
      request,
      action: RATE_LIMIT_ACTION.SEARCH_MOVIES,
      limit: RATE_LIMIT_CONFIG.SEARCH_MOVIES,
    });
    if (limited) return limited;

    // クエリパラメータのバリデーション
    const { searchParams } = new URL(request.url);
    const queryResult = searchQuerySchema.safeParse({
      query: searchParams.get('query') ?? undefined,
      page: searchParams.get('page') ?? undefined,
      genre: searchParams.get('genre') ?? undefined,
      year: searchParams.get('year') ?? undefined,
      release_date_gte: searchParams.get('release_date_gte') ?? undefined,
      release_date_lte: searchParams.get('release_date_lte') ?? undefined,
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

    // genre はZodのtransformで数値配列に変換済み
    const {
      query,
      page,
      genre: genreIds,
      year,
      release_date_gte,
      release_date_lte,
      vote_average_gte,
    } = queryResult.data;

    let result: TMDbResponse<Movie>;

    // サーバー側フィルタリングが適用されたかどうか
    let isServerFiltered = false;

    if (query) {
      // パターン1: キーワード検索（+ サーバー側フィルタリング）
      // TMDb /search/movie は year パラメータをサポートしているためAPI側に渡す
      result = await searchMovies({ query, page, year });

      // genre・vote_average_gte・公開期間はTMDb /search/movieが非対応のため
      // サーバー側でフィルタリングする
      const needsServerFilter =
        (genreIds && genreIds.length > 0) ||
        vote_average_gte !== undefined ||
        release_date_gte !== undefined ||
        release_date_lte !== undefined;

      if (needsServerFilter) {
        const filteredMovies = filterMovies(result.results, {
          genreIds,
          voteAverageGte: vote_average_gte,
          releaseDateGte: release_date_gte,
          releaseDateLte: release_date_lte,
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
      //
      // year と期間はスキーマで排他にしてあるので、両方が乗ることはない。
      // 意味論が違う（year＝代表公開日の年 / 期間＝いずれかの国のリリース）
      // ため混ぜると説明できない結果になる
      result = await discoverMovies({
        page,
        with_genres: genreIds?.join(','),
        primary_release_year: year,
        'release_date.gte': release_date_gte,
        'release_date.lte': release_date_lte,
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
          'Cache-Control': CACHE_CONTROL.PUBLIC_1H_SWR_24H,
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
