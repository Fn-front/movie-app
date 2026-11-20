/**
 * メールアドレス変更: 確認コードの送信（#1359）
 * POST /api/user/email-change/request
 *
 * ⚠️ **宛先はまだ本人のものでないアドレス。** 誰でも任意の宛先へ送れると
 * 自サービス名義の迷惑メールになるので、認証・パスワード照合・レート制限を
 * すべて通してからでないと送らない。
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

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
  SEND_EMAIL_CHANGE_RESULT,
  sendEmailChangeCode,
} from '@/lib/auth/emailChange';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { emailChangeRequestSchema } from '@/schema/auth';

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

    // ⚠️ **レート制限は原則どおり、検証より前に置く**（#1359 のレビュー）。
    //
    //   当初は `sendEmailChangeCode` の中（例外2）に置いていたが、
    //   **重複チェックで弾くパスが `sendEmailChangeCode` へ到達しない**ため
    //   枠を1つも消費しなかった。認証済みアカウントが1つあれば
    //   **全登録アドレスを無制限に列挙でき**、各リクエストが
    //   `bcrypt.compare` を1回ずつ消費する状態だった。
    //
    //   代償として、同じ間違いを繰り返すと1通も届かないまま枠が減る。
    //   列挙と bcrypt の消費を止めるほうを優先した。
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.EMAIL_CHANGE_REQUEST,
      RATE_LIMIT_CONFIG.EMAIL_CHANGE_REQUEST.maxAttempts,
      RATE_LIMIT_CONFIG.EMAIL_CHANGE_REQUEST.windowMinutes,
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
      emailChangeRequestSchema,
      AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
    );

    if (parsed.error) return parsed.error;

    const { newEmail, currentPassword } = parsed.data;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email, password_hash')
      .eq('id', session.user.id)
      .single();

    if (userError || !user) {
      return errorResponse(
        ERROR_CODE.NOT_FOUND,
        EMAIL_CHANGE_MESSAGES.FAILED,
        HTTP_STATUS.NOT_FOUND,
      );
    }

    // ⚠️ パスワードを持たない利用者（ソーシャル連携のみ）は対象外。
    //   アプリ側の `users.email` だけ変えると provider 側のアドレスと
    //   食い違い、次回のソーシャルログインで何が起きるか読めない
    if (!user.password_hash) {
      return errorResponse(
        ERROR_CODE.BAD_REQUEST,
        EMAIL_CHANGE_MESSAGES.PASSWORD_REQUIRED,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.password_hash,
    );

    if (!passwordMatches) {
      return errorResponse(
        ERROR_CODE.VALIDATION_ERROR,
        AUTH_ERROR_MESSAGES.CURRENT_PASSWORD_INCORRECT,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    if (newEmail === user.email) {
      return errorResponse(
        ERROR_CODE.VALIDATION_ERROR,
        EMAIL_CHANGE_MESSAGES.SAME_AS_CURRENT,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    // ⚠️ **重複はここで弾く。** 検証まで遅らせると、他人が使っている
    //   アドレスへ確認コードを送ってしまう（自サービス名義の迷惑メール）。
    //
    //   代償として「そのアドレスは登録済み」が認証済み利用者には分かる。
    //   列挙はレート制限（5回/60分・利用者ID単位）で遅く、他人の受信箱へ
    //   送らないほうを優先した。
    const { count: existingCount, error: existingError } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('email', newEmail);

    // ⚠️ error を捨てると「空いている」に化け、DB障害中だけ重複を許す
    if (existingError) throw existingError;

    if (existingCount) {
      return errorResponse(
        ERROR_CODE.VALIDATION_ERROR,
        EMAIL_CHANGE_MESSAGES.ALREADY_USED,
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    const result = await sendEmailChangeCode(
      supabase,
      session.user.id,
      newEmail,
    );

    if (result === SEND_EMAIL_CHANGE_RESULT.THROTTLED) {
      return errorResponse(
        ERROR_CODE.RATE_LIMIT_EXCEEDED,
        OTP_ERROR_MESSAGES.RESEND_TOO_SOON,
        HTTP_STATUS.TOO_MANY_REQUESTS,
      );
    }

    if (result === SEND_EMAIL_CHANGE_RESULT.SEND_FAILED) {
      return errorResponse(
        ERROR_CODE.SERVER_ERROR,
        OTP_ERROR_MESSAGES.EMAIL_SEND_FAILED,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }

    return NextResponse.json(
      { success: true, message: EMAIL_CHANGE_MESSAGES.CODE_SENT },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Email change request error:', error);

    return errorResponse(
      ERROR_CODE.SERVER_ERROR,
      EMAIL_CHANGE_MESSAGES.FAILED,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
    );
  }
}
