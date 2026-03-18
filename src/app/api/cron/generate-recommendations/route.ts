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
import { handleRouteError } from '@/helpers/routeError';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { executeGenerateRecommendationsCron } from '@/lib/recommendations/generateRecommendationsService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    const result = await executeGenerateRecommendationsCron(supabase);

    if (result.type === 'error') {
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

    return NextResponse.json(
      { success: true, data: result.data },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    return handleRouteError(
      error,
      'Generate recommendations error',
      CRON_ERROR_MESSAGES.GENERATE_RECOMMENDATIONS,
    );
  }
}
