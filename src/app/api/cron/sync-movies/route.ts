/**
 * 映画.com iCalフィード同期 Cron API
 * GET /api/cron/sync-movies
 *
 * Vercel Cronで週1回自動実行される。
 * CRON_SECRET環境変数によるBearer認証が必要。
 */

import { NextRequest, NextResponse } from 'next/server';

import { HTTP_STATUS, CRON_ERROR_MESSAGES } from '@/constants';
import { verifyCronAuth } from '@/helpers/cronAuth';
import { handleRouteError } from '@/helpers/routeError';
import { syncEigaMovies } from '@/lib/eiga/syncEigaMovies';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const result = await syncEigaMovies();

    return NextResponse.json(
      { success: true, data: result },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    return handleRouteError(
      error,
      'Sync eiga movies error',
      CRON_ERROR_MESSAGES.SYNC_MOVIES,
    );
  }
}
