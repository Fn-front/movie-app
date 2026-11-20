/**
 * 公開予定の劇場公開作品 同期 Cron API（#1000）
 * GET /api/cron/sync-upcoming
 *
 * Vercel Cronで日次自動実行される。
 * CRON_SECRET環境変数によるBearer認証が必要。
 *
 * ⚠️ **この CRON が止まると、公開予定一覧に新作が入ってこなくなる。**
 * 鮮度が落ちるだけの他の同期と違い、TMDb Discover から公開予定を拾う経路は
 * これだけ（詳細は `syncUpcomingMovies` のコメント）。
 */

import { NextRequest, NextResponse } from 'next/server';

import { HTTP_STATUS, CRON_ERROR_MESSAGES } from '@/constants';
import { verifyCronAuth } from '@/helpers/cronAuth';
import { handleCronError } from '@/helpers/cronError';
import { createServiceRoleClient } from '@/helpers/supabase';
import { notifyIfMostlyFailed } from '@/lib/cron/notifyHighFailureRate';
import { syncUpcomingMovies } from '@/lib/sync/syncUpcomingMovies';

export const dynamic = 'force-dynamic';

/**
 * ⚠️ 最大5ページの Discover を**直列**で叩き、ページごとに `isConcertFilm` の
 * 追加問い合わせが入る。`sync-now-playing`（同じ構成・5ページ）に合わせて 120 秒。
 */
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const authError = await verifyCronAuth(request, 'sync-upcoming');
    if (authError) return authError;

    const result = await syncUpcomingMovies();

    // ⚠️ **ほぼ全滅でも 200 / `success: true` で返る**（#1354）。
    //   ページ単位に catch して処理を続ける設計なので、失敗は `errors` に
    //   積まれるだけ。本文を読む監視が無い以上、人には届かない。
    //   ステータスは変えず、届くかどうかだけを変える
    await notifyIfMostlyFailed(createServiceRoleClient(), {
      cronName: 'sync-upcoming',
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
      'sync-upcoming',
      CRON_ERROR_MESSAGES.SYNC_UPCOMING,
    );
  }
}
