/**
 * アカウント削除API（#932）
 * DELETE /api/user
 *
 * プライバシーポリシー（/privacy）が受け付けると明記している削除請求の
 * セルフサービス窓口。個人情報保護法35条 / GDPR 17条。
 *
 * ⚠️ **物理削除**。論理削除だとポリシーの「消去」と実態が食い違う。
 * 取り消しはできない。
 *
 * ⚠️ **セッションだけでは消させない。** セッションを奪った第三者が
 * そのまま口封じにアカウントを消せてしまう。所持・記憶のいずれかを
 * 改めて要求する（`totp/disable` と同じ考え方）。
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import {
  ERROR_CODE,
  HTTP_STATUS,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import {
  ACCOUNT_DELETE_MESSAGES,
  AUTH_ERROR_MESSAGES,
  VALIDATION_MESSAGES,
} from '@/constants/auth';
import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import { parseAndValidate } from '@/helpers/requestValidation';
import { requireSecondFactor } from '@/helpers/secondFactorGuard';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { getSecondFactorMethod } from '@/lib/auth/secondFactor';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { accountDeleteApiSchema } from '@/schema/auth';

/** 統一エラーレスポンス */
function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // レート制限は検証より前。識別子がセッションなのでここで確定している
    // （`.claude/rules/api-route.md`「レート制限と検証の順序」の原則）
    //
    // ⚠️ 成功するとこの行も `delete_user_account` が消す（識別子は利用者ID）。
    //   残しても参照されないが、退会したのに行だけ残るのは気持ちが悪い
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.ACCOUNT_DELETE,
      RATE_LIMIT_CONFIG.ACCOUNT_DELETE.maxAttempts,
      RATE_LIMIT_CONFIG.ACCOUNT_DELETE.windowMinutes,
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

    // ⚠️ `request.json()` を直接呼ばない。壊れた JSON が例外になり、
    //   catch の 500 に化けて**利用者には「失敗しました」としか出ない**。
    //   `parseAndValidate` は 400 で返す
    const parsed = await parseAndValidate(
      request,
      accountDeleteApiSchema,
      AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
    );

    if (parsed.error) return parsed.error;

    const result = { data: parsed.data };

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', session.user.id)
      .single();

    if (userError || !user) {
      return errorResponse(
        ERROR_CODE.NOT_FOUND,
        ACCOUNT_DELETE_MESSAGES.NOT_FOUND,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    // ⚠️ パスワードを持たない利用者（ソーシャル連携のみ）は照合できない。
    //   必須にすると**永久に退会できなくなる**ので、持っている人にだけ要求する
    if (user.password_hash) {
      if (!result.data.currentPassword) {
        return errorResponse(
          ERROR_CODE.VALIDATION_ERROR,
          VALIDATION_MESSAGES.CURRENT_PASSWORD_REQUIRED,
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      const passwordMatches = await bcrypt.compare(
        result.data.currentPassword,
        user.password_hash,
      );

      if (!passwordMatches) {
        return errorResponse(
          ERROR_CODE.VALIDATION_ERROR,
          AUTH_ERROR_MESSAGES.CURRENT_PASSWORD_INCORRECT,
          HTTP_STATUS.BAD_REQUEST,
        );
      }
    }

    // ⚠️ 設定している人にだけ要求する。`requireSecondFactor` は未設定だと
    //   「設定されていません」の 400 を返すため、直接呼ぶと**未設定の利用者が
    //   退会できなくなる**
    const secondFactorMethod = await getSecondFactorMethod(
      supabase,
      session.user.id,
    );

    if (secondFactorMethod) {
      const guardResponse = await requireSecondFactor(
        supabase,
        session.user.id,
        result.data.code ?? '',
      );

      if (guardResponse) return guardResponse;
    }

    // ⚠️ `rate_limits` は CASCADE で消えない（identifier 文字列で引くため）。
    //   RPC の中で同じトランザクションにまとめてある
    const { error: deleteError } = await supabase.rpc('delete_user_account', {
      p_user_id: session.user.id,
    });

    if (deleteError) throw deleteError;

    return NextResponse.json(
      { success: true, message: ACCOUNT_DELETE_MESSAGES.SUCCESS },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Account delete error:', error);

    return errorResponse(
      ERROR_CODE.SERVER_ERROR,
      ACCOUNT_DELETE_MESSAGES.FAILED,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
