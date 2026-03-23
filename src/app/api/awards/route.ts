/**
 * 受賞作品API
 * GET /api/awards?year=2026
 *
 * 認証不要の公開API。
 * 指定年度の受賞作品データを AWARD_DEFINITIONS のカテゴリ順で返す。
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  ERROR_CODE,
  AWARD_DEFINITIONS,
  AWARDS_MESSAGES,
} from '@/constants';
import { handleRouteError } from '@/helpers/routeError';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import type {
  AwardMovie,
  AwardCategoryData,
  AwardData,
  AwardsResponseData,
} from '@/features/awards/types';

/** DBレコードをAwardMovie型に変換 */
function toAwardMovie(row: {
  tmdb_movie_id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
  genre_ids: number[] | null;
  person_name: string | null;
}): AwardMovie {
  return {
    tmdbMovieId: row.tmdb_movie_id,
    title: row.title,
    posterPath: row.poster_path,
    releaseDate: row.release_date,
    voteAverage: row.vote_average,
    genreIds: row.genre_ids,
    personName: row.person_name,
  };
}

export async function GET(request: Request) {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');

    const year = Number(yearParam);

    if (!yearParam || isNaN(year) || year < 1900 || year > 2100) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: 'yearパラメータは必須です（1900〜2100の数値）',
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 利用可能な年度一覧を取得
    const { data: yearRows, error: yearError } = await supabase
      .from('award_movies')
      .select('award_year')
      .order('award_year', { ascending: false });

    if (yearError) {
      throw yearError;
    }

    const availableYears = [
      ...new Set(
        (yearRows ?? []).map((r: { award_year: number }) => r.award_year),
      ),
    ];

    // 指定年度の受賞作品データを取得
    const { data: awardRows, error: awardError } = await supabase
      .from('award_movies')
      .select('*')
      .eq('award_year', year)
      .order('display_order', { ascending: true });

    if (awardError) {
      throw awardError;
    }

    // AWARD_DEFINITIONS の定義順でデータを構造化
    const awards: AwardData[] = [];

    for (const [awardName, awardDef] of Object.entries(AWARD_DEFINITIONS)) {
      const awardRows_filtered = (awardRows ?? []).filter(
        (r: { award_name: string }) => r.award_name === awardName,
      );

      if (awardRows_filtered.length === 0) continue;

      const categories: AwardCategoryData[] = [];

      for (const categoryDef of awardDef.categories) {
        const categoryRows = awardRows_filtered.filter(
          (r: { category: string }) => r.category === categoryDef.key,
        );

        if (categoryRows.length === 0) continue;

        const winner =
          categoryRows.find((r: { is_winner: boolean }) => r.is_winner) ?? null;
        const nominees = categoryRows.map(toAwardMovie);

        categories.push({
          category: categoryDef.key,
          label: categoryDef.label,
          winner: winner ? toAwardMovie(winner) : null,
          nominees,
        });
      }

      if (categories.length > 0) {
        awards.push({
          awardName,
          label: awardDef.label,
          categories,
        });
      }
    }

    const responseData: AwardsResponseData = {
      year,
      availableYears,
      awards,
    };

    return NextResponse.json(
      { success: true, data: responseData },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    return handleRouteError(
      error,
      'Awards fetch error',
      AWARDS_MESSAGES.FETCH_ERROR,
    );
  }
}
