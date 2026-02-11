/**
 * Now Playing 同期 Cron API
 * GET /api/cron/sync-now-playing
 *
 * Vercel Cronで日次自動実行される。
 * CRON_SECRET環境変数によるBearer認証が必要。
 */

import { NextRequest, NextResponse } from 'next/server';

import { HTTP_STATUS } from '@/constants';
import { syncNowPlayingMovies } from '@/lib/sync/syncNowPlayingMovies';

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
            code: 'UNAUTHORIZED',
            message: '認証に失敗しました。',
          },
        },
        { status: HTTP_STATUS.UNAUTHORIZED },
      );
    }

    // TMDb now_playing → DB同期
    const result = await syncNowPlayingMovies();

    return NextResponse.json(
      { success: true, data: result },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Sync now playing movies error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Now Playing映画同期中にエラーが発生しました。',
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
