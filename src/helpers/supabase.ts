/**
 * API Route用 Supabaseクライアントヘルパー
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { HTTP_STATUS, ERROR_CODE } from '@/constants';

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
 * Supabase anonキークライアントを作成（RLS有効）
 *
 * 公開APIなどRLSを適用したい場面で使用する。
 *
 * @returns Supabaseクライアント、環境変数未設定の場合はnull
 */
export function createAnonClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
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
        code: ERROR_CODE.SERVER_ERROR,
        message: AUTH_ERROR_MESSAGES.DB_CONNECTION_ERROR,
      },
    },
    { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
  );
}
