/**
 * API Route共通エラーハンドリング
 */

import { NextResponse } from 'next/server';

import { HTTP_STATUS, ERROR_CODE } from '@/constants';

/**
 * API Route共通エラーレスポンス生成
 */
export function handleRouteError(
  error: unknown,
  logPrefix: string,
  message: string,
): NextResponse {
  console.error(`${logPrefix}:`, error);

  return NextResponse.json(
    {
      success: false,
      error: {
        code: ERROR_CODE.SERVER_ERROR,
        message,
      },
    },
    { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
  );
}
