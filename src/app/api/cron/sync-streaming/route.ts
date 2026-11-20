/**
 * 配信（streaming）作品の事前同期 Cron API
 * GET /api/cron/sync-streaming
 *
 * Vercel Cronで日次自動実行される。
 * CRON_SECRET環境変数によるBearer認証が必要。
 *
 * TMDbのレート制限（50 req/s）に配慮し、theatrical系CRONとは実行時刻をずらしている。
 */

import { NextRequest, NextResponse } from 'next/server';

import { HTTP_STATUS, CRON_ERROR_MESSAGES } from '@/constants';
import { verifyCronAuth } from '@/helpers/cronAuth';
import { handleCronError } from '@/helpers/cronError';
import { syncStreamingMovies } from '@/lib/sync/syncStreamingMovies';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const authError = await verifyCronAuth(request, 'sync-streaming');
    if (authError) return authError;

    const result = await syncStreamingMovies();

    return NextResponse.json(
      { success: true, data: result },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    return handleCronError(
      error,
      'sync-streaming',
      CRON_ERROR_MESSAGES.SYNC_STREAMING,
    );
  }
}
