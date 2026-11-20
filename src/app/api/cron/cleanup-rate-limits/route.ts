/**
 * レート制限レコードの保持期間切れ削除 Cron API
 * GET /api/cron/cleanup-rate-limits
 *
 * Vercel Cronで日次自動実行される。
 * CRON_SECRET環境変数によるBearer認証が必要。
 *
 * 専用CRONにしている理由（#933）:
 *   個人情報保護法22条（不要となった個人データの消去）に関わる処理なので、
 *   無関係な処理の失敗でスキップされないようにする。
 *   `delete_expired_recommendation_events` はレコメンド生成CRONに相乗りして
 *   いるが、あちらは冒頭の `fetchActiveUserIds` が失敗すると早期 return で
 *   到達しない。
 */

import { NextRequest, NextResponse } from 'next/server';

import { HTTP_STATUS, CRON_ERROR_MESSAGES } from '@/constants';
import { RATE_LIMIT_RETENTION_HOURS } from '@/constants/rateLimit';
import { verifyCronAuth } from '@/helpers/cronAuth';
import { handleRouteError } from '@/helpers/routeError';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { deleteExpiredRateLimits } from '@/lib/rateLimit/cleanupRateLimits';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    const { deleted, completed } = await deleteExpiredRateLimits(supabase);

    console.log(
      `Deleted ${deleted} expired rate limit records (retention: ${RATE_LIMIT_RETENTION_HOURS}h, completed: ${completed})`,
    );

    // ⚠️ `completed` をレスポンスに載せること（#1342）。
    //   時間切れや反復上限で打ち切っても 200 を返すため、**ステータスコードしか
    //   見ない Vercel の Cron 監視からは完走と区別がつかない**。
    //   このリポジトリには監視系の依存が一つも入っておらず、`console.warn` は
    //   誰も tail していなければ観測されない。
    //
    //   ⛔ 打ち切りを throw に変えないこと。部分的に成功した掃除であり、
    //   throw すると削除済み件数が失われたうえ全失敗として扱われる。
    return NextResponse.json(
      {
        success: true,
        data: {
          deleted_count: deleted,
          completed,
          retention_hours: RATE_LIMIT_RETENTION_HOURS,
        },
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    return handleRouteError(
      error,
      'Cleanup rate limits error',
      CRON_ERROR_MESSAGES.CLEANUP_RATE_LIMITS,
    );
  }
}
