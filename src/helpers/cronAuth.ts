/**
 * CRON認証ヘルパー
 * Vercel Cron用のBearer認証を共通化
 */

import { NextResponse } from 'next/server';

import { HTTP_STATUS, ERROR_CODE, AUTH_ERROR_MESSAGES } from '@/constants';

/**
 * CRON_SECRET Bearerトークン認証
 *
 * @returns 認証失敗時はエラーレスポンス、成功時はnull
 */
export function verifyCronAuth(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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

  return null;
}
