/**
 * admin 専用 API Route のミドルウェア
 *
 * 画面側（`src/proxy.ts`）の保護は入口の体裁に過ぎない。`/api/*` は proxy の
 * 判定を素通りするため、**ロールの最終判定は必ずこちらで行う**。
 *
 * 設計: `.claude/documents/admin-account-design.md`
 */

import { NextResponse } from 'next/server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import { handleRouteError } from '@/helpers/routeError';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import {
  HTTP_STATUS,
  ERROR_CODE,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { AUTH_ERROR_MESSAGES, USER_ROLE } from '@/constants/auth';

/** admin 専用ルートハンドラーに渡されるコンテキスト */
export interface AdminRouteContext {
  /** 実行者（admin）のセッション */
  session: { user: { id: string } };
  supabase: SupabaseClient;
  request: Request;
  params?: Promise<Record<string, string>>;
}

/** withAdminAuth のオプション */
interface WithAdminAuthOptions {
  errorLog: string;
  errorMessage: string;
}

/** admin 専用ルートハンドラーの型 */
type AdminRouteHandler = (ctx: AdminRouteContext) => Promise<NextResponse>;

/**
 * 権限不足のレスポンスを生成する
 *
 * 未認証（401）と区別して 403 を返す。ログイン済みで権限が足りないだけなので、
 * 再ログインを促しても解決しない。
 */
function forbiddenResponse() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: ERROR_CODE.FORBIDDEN,
        message: AUTH_ERROR_MESSAGES.FORBIDDEN,
      },
    },
    { status: HTTP_STATUS.FORBIDDEN },
  );
}

/**
 * admin 権限の確認・Supabase 初期化・エラーハンドリングを共通化する
 *
 * ⚠️ ロールはセッション（JWT）ではなく**DBから読む**。JWT の `role` は
 * 最大5分古い値になりうるため（`SESSION_CONFIG.PASSWORD_CHECK_INTERVAL_MS`
 * 間隔でしか追従しない）、剥奪直後の管理操作を通してしまう。
 * admin 操作は最も強い権限なので、毎回DBで確認する。
 */
export function withAdminAuth(
  handler: AdminRouteHandler,
  options: WithAdminAuthOptions,
) {
  return async (
    request: Request,
    context?: { params?: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    try {
      const session = await getAuthSession();
      if (!session) return unauthorizedResponse();

      const supabase = createServiceRoleClient();
      if (!supabase) return dbConnectionErrorResponse();

      // ロール確認より前に消費する（#965）。
      //
      // ロールは毎回DBから読む必要がある（下記）が、その SELECT が
      // 無制限だと、ログイン済みの非 admin が admin ルートを連打するだけで
      // `users` を好きなだけ読ませられる。識別子はセッションなのでここで
      // 確定しており、`.claude/rules/api-route.md` の原則どおり前に置ける。
      //
      // 各ルート固有の制限（ADMIN_ACCOUNT_ISSUE 等）は handler 内に残す。
      const limitResult = await checkRateLimit(
        supabase,
        session.user.id,
        RATE_LIMIT_ACTION.ADMIN_ROLE_CHECK,
        RATE_LIMIT_CONFIG.ADMIN_ROLE_CHECK.maxAttempts,
        RATE_LIMIT_CONFIG.ADMIN_ROLE_CHECK.windowMinutes,
      );

      if (!limitResult.allowed) {
        return rateLimitExceededResponse(limitResult);
      }

      const { data: actor } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (actor?.role !== USER_ROLE.ADMIN) {
        return forbiddenResponse();
      }

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
