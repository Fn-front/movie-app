/**
 * CRON認証ヘルパー
 * Vercel Cron用のBearer認証を共通化
 */

import { timingSafeEqual } from 'crypto';

import { NextResponse } from 'next/server';

import { HTTP_STATUS, ERROR_CODE, AUTH_ERROR_MESSAGES } from '@/constants';

/**
 * CRON_SECRET Bearerトークン認証（タイミングセーフ比較）
 *
 * @returns 認証失敗時はエラーレスポンス、成功時はnull
 */
export function verifyCronAuth(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || !authHeader) {
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

  const expected = Buffer.from(`Bearer ${cronSecret}`);
  const actual = Buffer.from(authHeader);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
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
