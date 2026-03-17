/**
 * 劇場公開中の人気映画同期 Cron API
 * GET /api/cron/sync-now-showing
 *
 * Vercel Cronで日次自動実行される（毎日 JST AM3:00）。
 * CRON_SECRET環境変数によるBearer認証が必要。
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  ERROR_CODE,
  AUTH_ERROR_MESSAGES,
  CRON_ERROR_MESSAGES,
} from '@/constants';
import { syncNowShowingMovies } from '@/lib/sync/syncNowShowingMovies';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // CRON_SECRETで認証
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.UNAUTHORIZED,
            message: AUTH_ERROR_MESSAGES.AUTH_FAILED,
          },
        },
        { status: HTTP_STATUS.UNAUTHORIZED },
      );
    }

    // TMDb Discover → DB同期
    const result = await syncNowShowingMovies();

    return NextResponse.json(
      { success: true, data: result },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Sync now showing movies error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: CRON_ERROR_MESSAGES.SYNC_NOW_SHOWING,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
