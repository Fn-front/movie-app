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
import { createServiceRoleClient } from '@/helpers/supabase';
import { notifyIfMostlyFailed } from '@/lib/cron/notifyHighFailureRate';
import { handleCronError } from '@/helpers/cronError';
import { syncEigaMovies } from '@/lib/eiga/syncEigaMovies';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const authError = await verifyCronAuth(request, 'sync-movies');
    if (authError) return authError;

    const result = await syncEigaMovies();

    // ⚠️ **ほぼ全滅でも 200 / `success: true` で返る**（#1354）。
    //   作品単位に catch して処理を続ける設計なので、失敗は `errors` に
    //   積まれるだけ。本文を読む監視が無い以上、人には届かない。
    //   ステータスは変えず、届くかどうかだけを変える
    await notifyIfMostlyFailed(createServiceRoleClient(), {
      cronName: 'sync-movies',
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
      'sync-movies',
      CRON_ERROR_MESSAGES.SYNC_MOVIES,
    );
  }
}
