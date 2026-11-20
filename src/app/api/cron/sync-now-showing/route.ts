/**
 * 劇場公開中の人気映画同期 Cron API
 * GET /api/cron/sync-now-showing
 *
 * Vercel Cronで日次自動実行される（毎日 JST AM3:00）。
 * CRON_SECRET環境変数によるBearer認証が必要。
 */

import { NextRequest, NextResponse } from 'next/server';

import { HTTP_STATUS, CRON_ERROR_MESSAGES } from '@/constants';
import { verifyCronAuth } from '@/helpers/cronAuth';
import { handleCronError } from '@/helpers/cronError';
import { syncNowShowingMovies } from '@/lib/sync/syncNowShowingMovies';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const result = await syncNowShowingMovies();

    return NextResponse.json(
      { success: true, data: result },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    return handleCronError(
      error,
      'sync-now-showing',
      CRON_ERROR_MESSAGES.SYNC_NOW_SHOWING,
    );
  }
}
