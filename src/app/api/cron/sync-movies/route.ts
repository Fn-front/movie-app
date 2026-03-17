/**
 * 映画.com iCalフィード同期 Cron API
 * GET /api/cron/sync-movies
 *
 * Vercel Cronで週1回自動実行される。
 * CRON_SECRET環境変数によるBearer認証が必要。
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  ERROR_CODE,
  AUTH_ERROR_MESSAGES,
  CRON_ERROR_MESSAGES,
} from '@/constants';
import { syncEigaMovies } from '@/lib/eiga/syncEigaMovies';

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

    // iCal取得 → TMDb照合 → DB補完
    const result = await syncEigaMovies();

    return NextResponse.json(
      { success: true, data: result },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Sync eiga movies error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: CRON_ERROR_MESSAGES.SYNC_MOVIES,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
