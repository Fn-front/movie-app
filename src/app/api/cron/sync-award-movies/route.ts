/**
 * 受賞作品同期 Cron API
 * GET /api/cron/sync-award-movies
 *
 * Vercel Cronで毎月28日に自動実行される。
 * CRON_SECRET環境変数によるBearer認証が必要。
 *
 * 処理フロー:
 * 1. 当年・現在月に該当する賞を特定
 * 2. 該当する賞がなければスキップ
 * 3. 該当する賞について OpenAI + TMDb で受賞作品取得
 * 4. award_movies テーブルに UPSERT
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  ERROR_CODE,
  CRON_ERROR_MESSAGES,
  AWARD_YEAR_RANGE,
} from '@/constants';
import { verifyCronAuth } from '@/helpers/cronAuth';
import { countAwardFailures } from '@/lib/awards/awardFailures';
import { notifyCronFailure } from '@/lib/cron/notifyCronFailure';
import { notifyIfMostlyFailed } from '@/lib/cron/notifyHighFailureRate';
import { handleCronError } from '@/helpers/cronError';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { executeSyncAwardMoviesCron } from '@/lib/awards/syncAwardMoviesService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const authError = await verifyCronAuth(request, 'sync-award-movies');
    if (authError) return authError;

    const supabase = createServiceRoleClient();

    // ⚠️ ここも throw しないので catch の通知に乗らない（#979）。
    //   service role キーの失効は Issue が挙げた主要シナリオの1つ
    if (!supabase) {
      await notifyCronFailure(null, {
        cronName: 'sync-award-movies',
        reason: 'service role クライアントを作れません（環境変数を確認）',
      });
      return dbConnectionErrorResponse();
    }

    // 手動同期用: ?year=2025 で特定年のアカデミー賞を同期
    const yearParam = request.nextUrl.searchParams.get('year');
    const targetYear = yearParam ? Number(yearParam) : undefined;
    if (
      yearParam &&
      (isNaN(targetYear!) ||
        targetYear! < AWARD_YEAR_RANGE.MIN ||
        targetYear! > AWARD_YEAR_RANGE.MAX)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: `yearパラメータは${AWARD_YEAR_RANGE.MIN}〜${AWARD_YEAR_RANGE.MAX}の数値で指定してください`,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const result = await executeSyncAwardMoviesCron(supabase, targetYear);

    // ⚠️ **throw しないので catch の通知に乗らない**（#979）。
    //   generate-recommendations と同じ形。今は executeSyncAwardMoviesCron が
    //   'error' を返さないが、route.test.ts に分岐のテストがあるぶん
    //   生きているように見える。将来 error を返したときに黙らないようにする
    if (result.type === 'error') {
      await notifyCronFailure(supabase, {
        cronName: 'sync-award-movies',
        reason: result.error,
      });

      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.SERVER_ERROR,
            message: result.error,
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
      );
    }

    // ⚠️ **賞ごとに catch するので、全部取れなくても 200**（#1354）。
    //   発表前で記事がまだ無いだけのものは失敗に数えない
    //   （countAwardFailures が除外する）
    //
    // ⚠️ 「同期対象の賞が無い」ときは `data` の形が違う（`reason` だけ）。
    //   その月に該当する賞が無いのは正常なので、何もしない
    if ('skipped_awards' in result.data) {
      const { synced_awards: synced, skipped_awards: skipped } = result.data;

      await notifyIfMostlyFailed(supabase, {
        cronName: 'sync-award-movies',
        attempted: synced.length + skipped.length,
        failed: countAwardFailures(skipped),
        detail: skipped
          .map((award) => `${award.award_name}: ${award.reason}`)
          .join('\n'),
      });
    }

    return NextResponse.json(
      { success: true, data: result.data },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    return handleCronError(
      error,
      'sync-award-movies',
      CRON_ERROR_MESSAGES.SYNC_AWARD_MOVIES,
    );
  }
}
