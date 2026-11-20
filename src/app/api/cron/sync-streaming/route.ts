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
import { createServiceRoleClient } from '@/helpers/supabase';
import { notifyIfMostlyFailed } from '@/lib/cron/notifyHighFailureRate';
import { handleCronError } from '@/helpers/cronError';
import { syncStreamingMovies } from '@/lib/sync/syncStreamingMovies';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const authError = await verifyCronAuth(request, 'sync-streaming');
    if (authError) return authError;

    const result = await syncStreamingMovies();

    // ⚠️ **ほぼ全滅でも 200 / `success: true` で返る**（#1354）。
    //   作品単位に catch して処理を続ける設計なので、失敗は `errors` に
    //   積まれるだけ。本文を読む監視が無い以上、人には届かない。
    //   ステータスは変えず、届くかどうかだけを変える
    await notifyIfMostlyFailed(createServiceRoleClient(), {
      cronName: 'sync-streaming',
      ...result.items,
      // 取得段階で全滅すると attempted が 0 になり、率では表現できない（#1354）
      errorCount: result.errors.length,
      detail: result.errors.slice(0, 3).join('\n'),
    });

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
