/**
 * 保持期間切れレコードの削除 Cron API
 * GET /api/cron/cleanup-expired-records
 *
 * Vercel Cronで日次自動実行される。
 * CRON_SECRET環境変数によるBearer認証が必要。
 *
 * 対象は `src/lib/cleanup/expiredRecords.ts` の `CLEANUP_TARGETS`。
 * 現在は `rate_limits`（#933）/ `otp_codes`（#978）/
 * `password_reset_tokens`（#1300）の3つ。
 *
 * 専用CRONにしている理由（#933）:
 *   個人情報保護法22条（不要となった個人データの消去）に関わる処理なので、
 *   無関係な処理の失敗でスキップされないようにする。
 *   `delete_expired_recommendation_events` はレコメンド生成CRONに相乗りして
 *   いるが、あちらは冒頭の `fetchActiveUserIds` が失敗すると早期 return で
 *   到達しない。
 *
 * ⚠️ 同じ理由で、**対象どうしも互いに巻き込まない**。1つの RPC が失敗しても
 * 残りは実行する（`cleanupExpiredRecords` が対象ごとに catch する）。
 */

import { NextRequest, NextResponse } from 'next/server';

import { HTTP_STATUS, CRON_ERROR_MESSAGES, ERROR_CODE } from '@/constants';
import { verifyCronAuth } from '@/helpers/cronAuth';
import { handleCronError } from '@/helpers/cronError';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { cleanupExpiredRecords } from '@/lib/cleanup/expiredRecords';
import { notifyCronFailure } from '@/lib/cron/notifyCronFailure';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    const { targets, completed, hasError } =
      await cleanupExpiredRecords(supabase);

    for (const target of targets) {
      console.log(
        `[cleanup-expired-records] ${target.name}: deleted=${target.deleted_count} ` +
          `retention=${target.retention_hours}h completed=${target.completed}` +
          (target.error ? ` error=${target.error}` : ''),
      );
    }

    // ⚠️ `completed` をレスポンスに載せること（#1342）。
    //   時間切れや反復上限で打ち切っても 200 を返すため、**ステータスコードしか
    //   見ない Vercel の Cron 監視からは完走と区別がつかない**。
    //   このリポジトリには監視系の依存が一つも入っておらず、`console.warn` は
    //   誰も tail していなければ観測されない。
    //
    //   ⛔ 打ち切りを throw に変えないこと。部分的に成功した掃除であり、
    //   throw すると削除済み件数が失われたうえ全失敗として扱われる。
    //
    // ⚠️ ただし **RPC の失敗（`hasError`）は 500 にする**。打ち切りと違って
    //   「次回のCRONが続きを消す」では回復しない（権限不足・関数の欠落など
    //   設定の問題が多い）。部分的な結果は本文に残したまま、気づける形にする。
    //
    // ⚠️ **ここは throw しないので catch の通知に乗らない**（#979）。
    //   個人データの消去が止まっていることに気づけないのが問題そのもの
    //   （#933 / #978 / #1300）なので、明示的に通知する。
    //   `notifyCronFailure` は throw しない契約なので応答には影響しない
    if (hasError) {
      const failed = targets
        .filter((t) => t.error !== undefined)
        .map((t) => `${t.name}: ${t.error}`)
        .join(' / ');

      await notifyCronFailure(supabase, {
        cronName: 'cleanup-expired-records',
        reason: `保持期間切れの削除に失敗しました（${failed}）`,
      });
    }

    return NextResponse.json(
      {
        success: !hasError,
        // ⚠️ 失敗しても `data` を落とさない。部分的に成功した掃除なので、
        //   消えた件数と、どの対象が失敗したかを呼び出し側へ残す
        data: { targets, completed },
        // 他のエラー経路（`handleRouteError`）と同じ形を揃える。
        // 500 なのに `error` が無いと、形で分岐する監視が取りこぼす
        ...(hasError
          ? {
              error: {
                code: ERROR_CODE.SERVER_ERROR,
                message: CRON_ERROR_MESSAGES.CLEANUP_EXPIRED_RECORDS,
              },
            }
          : {}),
      },
      {
        status: hasError ? HTTP_STATUS.INTERNAL_SERVER_ERROR : HTTP_STATUS.OK,
      },
    );
  } catch (error) {
    return handleCronError(
      error,
      'cleanup-expired-records',
      CRON_ERROR_MESSAGES.CLEANUP_EXPIRED_RECORDS,
    );
  }
}
