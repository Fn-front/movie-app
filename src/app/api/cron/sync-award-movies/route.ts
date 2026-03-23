/**
 * 受賞作品同期 Cron API
 * GET /api/cron/sync-award-movies
 *
 * Vercel Cronで毎月28日に自動実行される。
 * CRON_SECRET環境変数によるBearer認証が必要。
 *
 * 処理フロー:
 * 1. 当年・現在月に該当する賞を特定
 * 2. 該当する賞がなければスキップ
 * 3. 該当する賞について OpenAI + TMDb で受賞作品取得
 * 4. award_movies テーブルに UPSERT
 */

import { NextRequest, NextResponse } from 'next/server';

import { HTTP_STATUS, ERROR_CODE, CRON_ERROR_MESSAGES } from '@/constants';
import { verifyCronAuth } from '@/helpers/cronAuth';
import { handleRouteError } from '@/helpers/routeError';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { executeSyncAwardMoviesCron } from '@/lib/awards/syncAwardMoviesService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // 手動同期用: ?year=2025 で特定年のアカデミー賞を同期
    const yearParam = request.nextUrl.searchParams.get('year');
    const targetYear = yearParam ? Number(yearParam) : undefined;
    if (yearParam && (isNaN(targetYear!) || targetYear! < 1900 || targetYear! > 2100)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: 'yearパラメータは1900〜2100の数値で指定してください',
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const result = await executeSyncAwardMoviesCron(supabase, targetYear);

    if (result.type === 'error') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.SERVER_ERROR,
            message: result.error,
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
      );
    }

    return NextResponse.json(
      { success: true, data: result.data },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    return handleRouteError(
      error,
      'Sync award movies error',
      CRON_ERROR_MESSAGES.SYNC_AWARD_MOVIES,
    );
  }
}
