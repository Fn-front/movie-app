/**
 * 映画キャッシュ バッチ更新 Cron API
 * GET /api/cron/update-movies
 *
 * Vercel Cronで毎日午前3時（JST）に自動実行される。
 * CRON_SECRET環境変数によるBearer認証が必要。
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  MOVIES_SUCCESS_MESSAGES,
  CRON_ERROR_MESSAGES,
} from '@/constants';
import { verifyCronAuth } from '@/helpers/cronAuth';
import { handleRouteError } from '@/helpers/routeError';
import { updateMoviesCacheByBatch } from '@/lib/sync/updateMoviesCacheByBatch';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const result = await updateMoviesCacheByBatch();

    return NextResponse.json(
      {
        success: true,
        message: MOVIES_SUCCESS_MESSAGES.CACHE_UPDATED,
        updated_count: result.updated,
        data: result,
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    return handleRouteError(
      error,
      'Batch update movies error',
      CRON_ERROR_MESSAGES.UPDATE_MOVIES,
    );
  }
}
