/**
 * レコメンド生成 Cron API
 * GET /api/cron/generate-recommendations
 *
 * Vercel Cronで日次自動実行される。
 * CRON_SECRET環境変数によるBearer認証が必要。
 *
 * 処理フロー:
 * 1. お気に入り1件以上のユーザーを取得
 * 2. ユーザーごとに: お気に入り取得 → 除外リスト取得 → OpenAI → TMDb検索 → DB保存
 * 3. ユーザー単位のtry-catchで1ユーザーの失敗が他に影響しない
 */

import { NextRequest, NextResponse } from 'next/server';

import { HTTP_STATUS, ERROR_CODE, CRON_ERROR_MESSAGES } from '@/constants';
import { verifyCronAuth } from '@/helpers/cronAuth';
import { notifyCronFailure } from '@/lib/cron/notifyCronFailure';
import { notifyIfMostlyFailed } from '@/lib/cron/notifyHighFailureRate';
import { handleCronError } from '@/helpers/cronError';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { executeGenerateRecommendationsCron } from '@/lib/recommendations/generateRecommendationsService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const authError = await verifyCronAuth(request, 'generate-recommendations');
    if (authError) return authError;

    const supabase = createServiceRoleClient();

    // ⚠️ ここも throw しないので catch の通知に乗らない（#979）。
    //   service role キーの失効は Issue が挙げた主要シナリオの1つ
    if (!supabase) {
      await notifyCronFailure(null, {
        cronName: 'generate-recommendations',
        reason: 'service role クライアントを作れません（環境変数を確認）',
      });
      return dbConnectionErrorResponse();
    }

    const result = await executeGenerateRecommendationsCron(supabase);

    // ⚠️ **ここも throw しないので catch の通知に乗らない**（#979）。
    //   500 を返しているのに通知だけ出ないのは一番紛らわしい
    if (result.type === 'error') {
      await notifyCronFailure(supabase, {
        cronName: 'generate-recommendations',
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

    // ⚠️ **利用者単位に catch するので、全員ぶん失敗しても 200**（#1354）。
    //   分母はお気に入りがあるアクティブ利用者の数。`skipped_users`
    //   （お気に入り不足などで対象外）は失敗に数えない
    await notifyIfMostlyFailed(supabase, {
      cronName: 'generate-recommendations',
      attempted:
        result.data.processed_users +
        result.data.skipped_users +
        result.data.failed_users,
      failed: result.data.failed_users,
      detail: 'レコメンドを生成できなかった利用者がいます',
    });

    return NextResponse.json(
      { success: true, data: result.data },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    return handleCronError(
      error,
      'generate-recommendations',
      CRON_ERROR_MESSAGES.GENERATE_RECOMMENDATIONS,
    );
  }
}
