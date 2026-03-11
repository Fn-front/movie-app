/**
 * 映画キャッシュ バッチ更新 Cron API
 * GET /api/cron/update-movies
 *
 * Vercel Cronで毎日午前3時（JST）に自動実行される。
 * CRON_SECRET環境変数によるBearer認証が必要。
 */

import { NextRequest, NextResponse } from 'next/server';

import { HTTP_STATUS, ERROR_CODE, AUTH_ERROR_MESSAGES } from '@/constants';
import { updateMoviesCacheByBatch } from '@/lib/sync/updateMoviesCacheByBatch';

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

    // バッチ更新実行
    const result = await updateMoviesCacheByBatch();

    return NextResponse.json(
      {
        success: true,
        message: '映画キャッシュを更新しました',
        updated_count: result.updated,
        data: result,
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Batch update movies error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: '映画キャッシュのバッチ更新中にエラーが発生しました。',
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
