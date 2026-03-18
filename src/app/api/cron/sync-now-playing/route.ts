/**
 * Now Playing 同期 Cron API
 * GET /api/cron/sync-now-playing
 *
 * Vercel Cronで日次自動実行される。
 * CRON_SECRET環境変数によるBearer認証が必要。
 */

import { NextRequest, NextResponse } from 'next/server';

import { HTTP_STATUS, CRON_ERROR_MESSAGES } from '@/constants';
import { verifyCronAuth } from '@/helpers/cronAuth';
import { handleRouteError } from '@/helpers/routeError';
import { syncNowPlayingMovies } from '@/lib/sync/syncNowPlayingMovies';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const result = await syncNowPlayingMovies();

    return NextResponse.json(
      { success: true, data: result },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    return handleRouteError(
      error,
      'Sync now playing movies error',
      CRON_ERROR_MESSAGES.SYNC_NOW_PLAYING,
    );
  }
}
