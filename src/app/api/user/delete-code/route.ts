/**
 * 退会の確認コード送信（#1362）
 * POST /api/user/delete-code
 *
 * ⛔ **パスワードも第2要素も持たない利用者には、再確認が1つも掛かっていなかった。**
 *   OAuth のみで登録し二段階認証を設定していない層は照合する材料が無く、
 *   セッションだけで2クリックでアカウントが消せた。取り消しできない操作なので、
 *   セッションを奪われた時点でデータを失う。
 *
 * ⚠️ 宛先は**必ず `users.email` から引く**。ボディの値を受け付けると、
 *   アカウントを1つ持つだけで任意のアドレスへ自サービス名義の
 *   「退会の確認コード」を送れる（#641）。このルートはボディを読まない。
 */

import { NextResponse } from 'next/server';

import {
  ERROR_CODE,
  HTTP_STATUS,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { ACCOUNT_DELETE_CODE_MESSAGES } from '@/constants/accountDeleteCode';
import { ACCOUNT_DELETE_MESSAGES, AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { OTP_ERROR_MESSAGES } from '@/constants/otp';
import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import {
  SEND_ACCOUNT_DELETE_CODE_RESULT,
  sendAccountDeleteCode,
} from '@/lib/auth/accountDeleteCode';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';

/** 統一エラーレスポンス */
function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

export async function POST(): Promise<NextResponse> {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // レート制限は原則どおり。識別子がセッションなのでここで確定している。
    //
    // ⚠️ 削除の試行（`ACCOUNT_DELETE`）とは別カウンタ。同じにすると、
    //   コードを送り直すだけで削除の試行枠を食い尽くし、**正しいコードを
    //   持っていても消せなくなる**
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.ACCOUNT_DELETE_CODE_SEND,
      RATE_LIMIT_CONFIG.ACCOUNT_DELETE_CODE_SEND.maxAttempts,
      RATE_LIMIT_CONFIG.ACCOUNT_DELETE_CODE_SEND.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
            message: AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
            details: { retryAfter: rateLimitResult.retryAfter },
          },
        },
        { status: HTTP_STATUS.TOO_MANY_REQUESTS },
      );
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email, username')
      .eq('id', session.user.id)
      .single();

    if (userError || !user) {
      return errorResponse(
        ERROR_CODE.NOT_FOUND,
        ACCOUNT_DELETE_MESSAGES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    // ⚠️ admin が発行したアカウントは `users.email` が
    //   `generateSyntheticEmail()` の `.invalid` TLD（RFC 2606、絶対に
    //   名前解決されない）なので、送っても永久に届かない。黙って送ると
    //   「待っても来ない」行き止まりになる（`totp/setup` と同じ判断）。
    //
    // ⚠️ 実際には到達しない想定。発行アカウントは必ずパスワードを持つので、
    //   退会はパスワード照合の分岐に入りこのコードを要求されない
    if (user.username) {
      return errorResponse(
        ERROR_CODE.BAD_REQUEST,
        ACCOUNT_DELETE_CODE_MESSAGES.EMAIL_UNAVAILABLE,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const result = await sendAccountDeleteCode(
      supabase,
      session.user.id,
      user.email,
    );

    if (result === SEND_ACCOUNT_DELETE_CODE_RESULT.THROTTLED) {
      return errorResponse(
        ERROR_CODE.RATE_LIMIT_EXCEEDED,
        OTP_ERROR_MESSAGES.RESEND_TOO_SOON,
        HTTP_STATUS.TOO_MANY_REQUESTS,
      );
    }

    if (result === SEND_ACCOUNT_DELETE_CODE_RESULT.SEND_FAILED) {
      return errorResponse(
        ERROR_CODE.SERVER_ERROR,
        OTP_ERROR_MESSAGES.EMAIL_SEND_FAILED,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }

    return NextResponse.json(
      { success: true, message: ACCOUNT_DELETE_CODE_MESSAGES.CODE_SENT },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Account delete code send error:', error);

    return errorResponse(
      ERROR_CODE.SERVER_ERROR,
      ACCOUNT_DELETE_MESSAGES.FAILED,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
