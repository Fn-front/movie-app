/**
 * 保持期間切れレコードの削除 Cron API
 * GET /api/cron/cleanup-expired-records
 *
 * Vercel Cronで日次自動実行される。
 * CRON_SECRET環境変数によるBearer認証が必要。
 *
 * 対象は `src/lib/cleanup/expiredRecords.ts` の `CLEANUP_TARGETS`。
 * 現在は `rate_limits`（#933）/ `otp_codes`（#978）/
 * `password_reset_tokens`（#1300）/ `recommendation_events`（#1355）の4つ。
 *
 * 専用CRONにしている理由（#933）:
 *   個人情報保護法22条（不要となった個人データの消去）に関わる処理なので、
 *   無関係な処理の失敗でスキップされないようにする。
 *   `recommendation_events` は長らくレコメンド生成CRONに相乗りしていたが、
 *   あちらは冒頭の `fetchActiveUserIds` が失敗すると早期 return で到達せず、
 *   しかも**失敗を catch して 0 を返す**ので消えていないことに気づけなかった。
 *   #1355 でここへ移した。
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
    const authError = await verifyCronAuth(request, 'cleanup-expired-records');
    if (authError) return authError;

    const supabase = createServiceRoleClient();

    // ⚠️ ここも throw しないので catch の通知に乗らない（#979）。
    //   service role キーの失効は Issue が挙げた主要シナリオの1つ
    if (!supabase) {
      await notifyCronFailure(null, {
        cronName: 'cleanup-expired-records',
        reason: 'service role クライアントを作れません（環境変数を確認）',
      });
      return dbConnectionErrorResponse();
    }

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
    //
    // ⚠️ **打ち切りも通知する**（#433）。対象が4→7に増え、35秒の時間予算を
    //   分け合うようになった。予算は先頭から使われるので、`rate_limits` が
    //   滞留した日は末尾の対象が毎日0件で終わる。打ち切りは 200 で返すため
    //   **ステータスコードしか見ない監視からは完走と区別がつかない**。
    //   消し残しは「保持期間を超えた個人データ・TMDbコンテンツが残っている」
    //   状態そのものなので、エラーと同じく気づける形にする。
    const truncated = targets.filter((t) => !t.completed && !t.error);

    if (hasError || truncated.length > 0) {
      const failed = targets
        .filter((t) => t.error !== undefined)
        .map((t) => `${t.name}: ${t.error}`)
        .join(' / ');

      const reason = hasError
        ? `保持期間切れの削除に失敗しました（${failed}）`
        : `保持期間切れの削除が時間内に終わりませんでした（${truncated
            .map((t) => t.name)
            .join(' / ')}）`;

      await notifyCronFailure(supabase, {
        cronName: 'cleanup-expired-records',
        reason,
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
