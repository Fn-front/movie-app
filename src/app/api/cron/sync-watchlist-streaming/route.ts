/**
 * ウォッチリスト配信状況 同期 Cron API
 * GET /api/cron/sync-watchlist-streaming
 *
 * Vercel Cron で毎日20:00（JST）に自動実行される。
 * sync-streaming（19:00）の後に回し、TMDb への問い合わせが重ならないようにする。
 * CRON_SECRET 環境変数による Bearer 認証が必要。
 */

import { NextRequest, NextResponse } from 'next/server';

import { HTTP_STATUS, CRON_ERROR_MESSAGES } from '@/constants';
import { verifyCronAuth } from '@/helpers/cronAuth';
import { handleRouteError } from '@/helpers/routeError';
import { syncWatchlistStreaming } from '@/lib/sync/syncWatchlistStreaming';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const result = await syncWatchlistStreaming();

    return NextResponse.json(
      {
        success: true,
        message: 'ウォッチリストの配信状況を同期しました。',
        data: result,
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    return handleRouteError(
      error,
      'Sync watchlist streaming error',
      CRON_ERROR_MESSAGES.SYNC_WATCHLIST_STREAMING,
    );
  }
}
