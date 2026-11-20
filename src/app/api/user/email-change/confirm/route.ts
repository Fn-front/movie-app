/**
 * メールアドレス変更: 確認コードの検証と差し替え（#1359）
 * POST /api/user/email-change/confirm
 *
 * ⚠️ **成功するとログイン識別子が変わる。** 旧アドレスではもうログイン
 * できないので、通知は旧アドレスへ送る（乗っ取りに気づける唯一の手段）。
 */

import { NextResponse } from 'next/server';

import {
  ERROR_CODE,
  HTTP_STATUS,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { EMAIL_CHANGE_MESSAGES } from '@/constants/emailChange';
import { OTP_ERROR_MESSAGES } from '@/constants/otp';
import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import { parseAndValidate } from '@/helpers/requestValidation';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import {
  EMAIL_CHANGE_VERIFY_RESULT,
  consumeEmailChangeCode,
} from '@/lib/auth/emailChange';
import { sendEmailChangedNotice } from '@/lib/auth/sendEmailChangedNotice';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { emailChangeConfirmSchema } from '@/schema/auth';

/** 一意制約違反。重複は UNIQUE が弾く */
const UNIQUE_VIOLATION = '23505';

/** 統一エラーレスポンス */
function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // レート制限は検証より前。識別子がセッションなのでここで確定している
    // （`.claude/rules/api-route.md` の原則）
    //
    // ⚠️ `otp_codes.attempts`（上限5）は**コード1本あたり**の試行しか
    //   数えない。送信枠とは別のカウンタで、コードを作り直しながらの
    //   総当たりを抑える
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.EMAIL_CHANGE_VERIFY,
      RATE_LIMIT_CONFIG.EMAIL_CHANGE_VERIFY.maxAttempts,
      RATE_LIMIT_CONFIG.EMAIL_CHANGE_VERIFY.windowMinutes,
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

    const parsed = await parseAndValidate(
      request,
      emailChangeConfirmSchema,
      AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
    );

    if (parsed.error) return parsed.error;

    const { newEmail, code } = parsed.data;

    const verifyResult = await consumeEmailChangeCode(supabase, newEmail, code);

    if (verifyResult !== EMAIL_CHANGE_VERIFY_RESULT.SUCCESS) {
      return errorResponse(
        ERROR_CODE.VALIDATION_ERROR,
        OTP_ERROR_MESSAGES.INVALID_CODE,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // ⚠️ 旧アドレスの `rate_limits` / `otp_codes` も同じトランザクションで消す。
    //   残すと古いアドレスの行が永久に残り、新しいアドレスは枠0から始まる
    const { data: oldEmail, error: changeError } = await supabase.rpc(
      'change_user_email',
      { p_user_id: session.user.id, p_new_email: newEmail },
    );

    if (changeError) {
      // ⚠️ 事前チェックと UPDATE の間に別の利用者が同じアドレスを取った場合。
      //   利用者向けの文言へ変換する（500 だと何が起きたか伝わらない）
      if (changeError.code === UNIQUE_VIOLATION) {
        return errorResponse(
          ERROR_CODE.VALIDATION_ERROR,
          EMAIL_CHANGE_MESSAGES.ALREADY_USED,
          HTTP_STATUS.BAD_REQUEST,
        );
      }

      throw changeError;
    }

    // ⚠️ **戻り値で止めない。** 変更はもう確定しており、ここで 500 にすると
    //   正しいコードを入れた利用者が「失敗した」と思って同じ操作を繰り返す
    //   行き止まりを作る（`sendPasswordInvalidatedEmail` と同じ契約）
    if (typeof oldEmail === 'string') {
      await sendEmailChangedNotice(oldEmail, newEmail);
    }

    return NextResponse.json(
      { success: true, message: EMAIL_CHANGE_MESSAGES.CHANGED },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Email change confirm error:', error);

    return errorResponse(
      ERROR_CODE.SERVER_ERROR,
      EMAIL_CHANGE_MESSAGES.FAILED,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
