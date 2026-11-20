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
import { createServiceRoleClient } from '@/helpers/supabase';
import { notifyIfMostlyFailed } from '@/lib/cron/notifyHighFailureRate';
import { handleCronError } from '@/helpers/cronError';
import { syncWatchlistStreaming } from '@/lib/sync/syncWatchlistStreaming';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const authError = await verifyCronAuth(request, 'sync-watchlist-streaming');
    if (authError) return authError;

    const result = await syncWatchlistStreaming();

    // ⚠️ **ほぼ全滅でも 200 / `success: true` で返る**（#1354）。
    //   作品単位に catch して処理を続ける設計なので、失敗は `errors` に
    //   積まれるだけ。本文を読む監視が無い以上、人には届かない。
    //   ステータスは変えず、届くかどうかだけを変える
    await notifyIfMostlyFailed(createServiceRoleClient(), {
      cronName: 'sync-watchlist-streaming',
      attempted: result.targets,
      failed: result.failed,
      detail: result.errors.slice(0, 3).join('\n'),
    });

    return NextResponse.json(
      {
        success: true,
        message: 'ウォッチリストの配信状況を同期しました。',
        data: result,
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    return handleCronError(
      error,
      'sync-watchlist-streaming',
      CRON_ERROR_MESSAGES.SYNC_WATCHLIST_STREAMING,
    );
  }
}
