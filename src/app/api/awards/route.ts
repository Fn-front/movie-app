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
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { handleRouteError } from '@/helpers/routeError';
import {
  createAnonClient,
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import type {
  AwardMovie,
  AwardCategoryData,
  AwardData,
  AwardsResponseData,
} from '@/features/awards/types';

/**
 * 受賞作品クエリで取得するカラム
 * ※ AwardMovieRow と必ず同期すること
 */
const AWARD_MOVIES_SELECT =
  'tmdb_movie_id, title, poster_path, release_date, vote_average, genre_ids, person_name, award_name, category, is_winner, display_order';

/**
 * 受賞作品の行型
 * ※ AWARD_MOVIES_SELECT と必ず同期すること
 */
interface AwardMovieRow {
  tmdb_movie_id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
  genre_ids: number[] | null;
  person_name: string | null;
  award_name: string;
  category: string;
  is_winner: boolean;
  display_order: number;
}

/** Cache-Control: CDNで1時間キャッシュ、stale-while-revalidateで24時間 */
const CACHE_CONTROL_VALUE =
  'public, s-maxage=3600, stale-while-revalidate=86400';

/** レートリミット設定: IP単位で30回/10分 */
const RATE_LIMIT_MAX_ATTEMPTS = 30;
const RATE_LIMIT_WINDOW_MINUTES = 10;

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

/** リクエストからクライアントIPを取得 */
function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}

export async function GET(request: Request) {
  try {
    // バリデーション（不正リクエストはレートリミット消費対象外）
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

    // レートリミットチェック（service roleで rate_limits テーブルにアクセス）
    // ※ checkRateLimitは「N回到達でロック」方式のバースト保護。
    //   スライディングウィンドウ方式ではないが、Cache-Controlとの併用で十分な保護を提供する。
    const serviceSupabase = createServiceRoleClient();
    if (serviceSupabase) {
      const clientIp = getClientIp(request);
      const rateLimitResult = await checkRateLimit(
        serviceSupabase,
        clientIp,
        'awards_fetch',
        RATE_LIMIT_MAX_ATTEMPTS,
        RATE_LIMIT_WINDOW_MINUTES,
      );

      if (!rateLimitResult.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
              message: AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
            },
          },
          {
            status: HTTP_STATUS.TOO_MANY_REQUESTS,
            headers: {
              ...(rateLimitResult.retryAfter
                ? { 'Retry-After': String(rateLimitResult.retryAfter) }
                : {}),
              'Cache-Control': 'no-store',
            },
          },
        );
      }
    }

    // データ取得はanonキー（RLS有効）
    const supabase = createAnonClient();
    if (!supabase) return dbConnectionErrorResponse();

    // 利用可能な年度一覧を取得（DB 側で DISTINCT・降順ソート）
    const { data: availableYears, error: yearError } =
      await supabase.rpc('get_award_years');

    if (yearError) {
      throw yearError;
    }

    // 指定年度の受賞作品データを取得（必要カラムのみ）
    const { data: rawAwardRows, error: awardError } = await supabase
      .from('award_movies')
      .select(AWARD_MOVIES_SELECT)
      .eq('award_year', year)
      .order('display_order', { ascending: true });

    if (awardError) {
      throw awardError;
    }

    const awardRows = (rawAwardRows ?? []) as unknown as AwardMovieRow[];

    // AWARD_DEFINITIONS の定義順でデータを構造化
    const awards: AwardData[] = [];

    for (const [awardName, awardDef] of Object.entries(AWARD_DEFINITIONS)) {
      const filteredAwardRows = awardRows.filter(
        (r) => r.award_name === awardName,
      );

      if (filteredAwardRows.length === 0) continue;

      const categories: AwardCategoryData[] = [];

      for (const categoryDef of awardDef.categories) {
        const categoryRows = filteredAwardRows.filter(
          (r) => r.category === categoryDef.key,
        );

        if (categoryRows.length === 0) continue;

        const winner = categoryRows.find((r) => r.is_winner) ?? null;
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
      availableYears: availableYears ?? [],
      awards,
    };

    return NextResponse.json(
      { success: true, data: responseData },
      {
        status: HTTP_STATUS.OK,
        headers: { 'Cache-Control': CACHE_CONTROL_VALUE },
      },
    );
  } catch (error) {
    return handleRouteError(
      error,
      'Awards fetch error',
      AWARDS_MESSAGES.FETCH_ERROR,
    );
  }
}
