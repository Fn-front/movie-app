/**
 * 二段階認証の設定に使う再認証コードの送信（#1368）
 * POST /api/user/totp/reauth-code
 *
 * ⛔ **第2要素はセッションだけで自己登録できた。** `totp/setup` に再認証を
 *   足したが、**パスワードを持たない利用者（OAuth のみ）には照合する材料が
 *   無い**。登録アドレスへ使い捨てコードを送って受信箱の所持を確かめる。
 *
 * ⚠️ 宛先は**必ず `users.email` から引く**。ボディを受け付けると、
 *   アカウントを1つ持つだけで任意のアドレスへ自サービス名義のコードを
 *   送れる（#641）。このルートはボディを読まない。
 */

import { NextResponse } from 'next/server';

import {
  ERROR_CODE,
  HTTP_STATUS,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { OTP_ERROR_MESSAGES } from '@/constants/otp';
import { SECOND_FACTOR_MESSAGES } from '@/constants/secondFactor';
import {
  SECOND_FACTOR_SETUP_CODE_MESSAGES,
  SECOND_FACTOR_SETUP_OTP_ACTION,
} from '@/constants/secondFactorSetupCode';
import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import {
  SEND_USER_BOUND_OTP_RESULT,
  sendUserBoundOtp,
} from '@/lib/auth/userBoundOtp';
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
    // ⚠️ `TOTP_SETTINGS_VERIFY`（設定変更の試行）とは**別カウンタ**。
    //   同じにすると、コードを送り直すだけで設定の試行枠を食い尽くし、
    //   **正しいコードを持っていても設定できなくなる**
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.SECOND_FACTOR_SETUP_CODE_SEND,
      RATE_LIMIT_CONFIG.SECOND_FACTOR_SETUP_CODE_SEND.maxAttempts,
      RATE_LIMIT_CONFIG.SECOND_FACTOR_SETUP_CODE_SEND.windowMinutes,
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
      .select('email, username, password_hash')
      .eq('id', session.user.id)
      .single();

    // ⚠️ **読み取りの失敗と「行が無い」を分ける**（#1368 のレビュー）。
    //   まとめると、DB の一時的な不調が「このアカウントには確認コードを
    //   お送りできません。お手数ですが窓口までご連絡ください。」になり、
    //   待てば直る障害で利用者を窓口へ送ってしまう。
    //   同じ `users` の読み取りについて `totp/setup` は 500 に倒している
    if (userError) throw userError;

    if (!user) {
      return errorResponse(
        ERROR_CODE.NOT_FOUND,
        SECOND_FACTOR_SETUP_CODE_MESSAGES.EMAIL_UNAVAILABLE,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    // ⚠️ **コードが要らない利用者には送らない。** パスワードを持つ利用者は
    //   `setup` でパスワードを要求されるので、このコードを使う場面が無い。
    //   送ると無駄なメールが届き、セッションを奪った第三者が被害者の
    //   受信箱へ5通/60分を送り込む経路にもなる（#1362 と同じ判断）
    if (user.password_hash) {
      return errorResponse(
        ERROR_CODE.BAD_REQUEST,
        SECOND_FACTOR_SETUP_CODE_MESSAGES.CODE_NOT_REQUIRED,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // ⚠️ admin が発行したアカウントは `users.email` が `.invalid` TLD
    //   （RFC 2606、絶対に名前解決されない）なので永久に届かない。
    //   黙って送ると「待っても来ない」行き止まりになる。
    //
    // ⚠️ 実際には到達しない想定（発行アカウントは必ずパスワードを持つ）
    if (user.username) {
      return errorResponse(
        ERROR_CODE.BAD_REQUEST,
        SECOND_FACTOR_SETUP_CODE_MESSAGES.EMAIL_UNAVAILABLE,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const result = await sendUserBoundOtp(
      supabase,
      session.user.id,
      user.email,
      SECOND_FACTOR_SETUP_OTP_ACTION,
    );

    if (result === SEND_USER_BOUND_OTP_RESULT.THROTTLED) {
      return errorResponse(
        ERROR_CODE.RATE_LIMIT_EXCEEDED,
        OTP_ERROR_MESSAGES.RESEND_TOO_SOON,
        HTTP_STATUS.TOO_MANY_REQUESTS,
      );
    }

    if (result === SEND_USER_BOUND_OTP_RESULT.SEND_FAILED) {
      return errorResponse(
        ERROR_CODE.SERVER_ERROR,
        OTP_ERROR_MESSAGES.EMAIL_SEND_FAILED,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: SECOND_FACTOR_SETUP_CODE_MESSAGES.CODE_SENT,
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Second factor reauth code send error:', error);

    return errorResponse(
      ERROR_CODE.SERVER_ERROR,
      SECOND_FACTOR_MESSAGES.SEND_FAILED,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
