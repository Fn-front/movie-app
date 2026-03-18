/**
 * API Route共通ミドルウェア
 * 認証チェック・Supabase初期化・エラーハンドリングを共通化
 */

import { NextResponse } from 'next/server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import { handleRouteError } from '@/helpers/routeError';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';

export { handleRouteError } from '@/helpers/routeError';

/** 認証済みルートハンドラーに渡されるコンテキスト */
export interface AuthRouteContext {
  session: { user: { id: string } };
  supabase: SupabaseClient;
  request: Request;
  params?: Promise<Record<string, string>>;
}

/** withAuth のオプション */
interface WithAuthOptions {
  errorLog: string;
  errorMessage: string;
}

/** 認証済みルートハンドラーの型 */
type AuthRouteHandler = (ctx: AuthRouteContext) => Promise<NextResponse>;

/**
 * 認証チェック・Supabase初期化・エラーハンドリングを共通化するミドルウェア
 */
export function withAuth(handler: AuthRouteHandler, options: WithAuthOptions) {
  return async (
    request: Request,
    context?: { params?: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    try {
      const session = await getAuthSession();
      if (!session) return unauthorizedResponse();

      const supabase = createServiceRoleClient();
      if (!supabase) return dbConnectionErrorResponse();

      return await handler({
        session,
        supabase,
        request,
        params: context?.params,
      });
    } catch (error) {
      return handleRouteError(error, options.errorLog, options.errorMessage);
    }
  };
}
