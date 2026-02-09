/**
 * API Route用 Supabase service roleクライアントヘルパー
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { HTTP_STATUS } from '@/constants';

/**
 * Supabase service roleクライアントを作成
 *
 * @returns Supabaseクライアント、環境変数未設定の場合はnull
 */
export function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * DB接続エラーレスポンスを生成
 */
export function dbConnectionErrorResponse() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: AUTH_ERROR_MESSAGES.DB_CONNECTION_ERROR,
      },
    },
    { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
  );
}
