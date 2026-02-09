/**
 * API Route用 認証ヘルパー
 */

import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth/auth';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { HTTP_STATUS } from '@/constants';

/**
 * 認証済みセッションを取得
 *
 * @returns セッション（user.id保証）、未認証の場合はnull
 */
export async function getAuthSession() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  return session;
}

/**
 * 認証エラーレスポンスを生成
 */
export function unauthorizedResponse() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: AUTH_ERROR_MESSAGES.UNAUTHORIZED,
      },
    },
    { status: HTTP_STATUS.UNAUTHORIZED },
  );
}
