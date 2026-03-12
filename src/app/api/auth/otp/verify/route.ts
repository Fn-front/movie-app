/**
 * OTP検証API
 * POST /api/auth/otp/verify
 */

import { NextResponse } from 'next/server';

import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { otpVerifySchema } from '@/schema/otp';
import {
  OTP_ACTION,
  OTP_CONFIG,
  OTP_ERROR_MESSAGES,
  OTP_SUCCESS_MESSAGES,
  HTTP_STATUS,
  ERROR_CODE,
  AUTH_ERROR_MESSAGES,
} from '@/constants';

export async function POST(request: Request) {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // リクエストボディのバリデーション
    const body = await request.json();
    const result = otpVerifySchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
            details: result.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const { email, code, action } = result.data;

    // otp_codesテーブルから該当レコード検索（最新の未検証OTP）
    const { data: otpRecord, error: fetchError } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('email', email)
      .eq('action_type', action)
      .is('verified_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !otpRecord) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.BAD_REQUEST,
            message: OTP_ERROR_MESSAGES.CODE_NOT_FOUND,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 有効期限チェック
    const now = new Date();
    const expiresAt = new Date(otpRecord.expires_at);

    if (now > expiresAt) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.BAD_REQUEST,
            message: OTP_ERROR_MESSAGES.CODE_EXPIRED,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 試行回数チェック
    if (otpRecord.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
            message: OTP_ERROR_MESSAGES.MAX_ATTEMPTS_EXCEEDED,
          },
        },
        { status: HTTP_STATUS.TOO_MANY_REQUESTS },
      );
    }

    // コード照合
    if (otpRecord.code !== code) {
      // 試行回数をインクリメント
      const newAttempts = otpRecord.attempts + 1;
      await supabase
        .from('otp_codes')
        .update({ attempts: newAttempts })
        .eq('id', otpRecord.id);

      const remainingAttempts = OTP_CONFIG.MAX_ATTEMPTS - newAttempts;

      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.BAD_REQUEST,
            message: `${OTP_ERROR_MESSAGES.INVALID_CODE}残り${remainingAttempts}回入力できます。`,
            details: { remainingAttempts },
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // アクション別後処理
    if (action === OTP_ACTION.REGISTRATION) {
      // is_verified = true に更新
      await supabase
        .from('users')
        .update({ is_verified: true })
        .eq('email', email);

      // OTPレコード削除
      await supabase.from('otp_codes').delete().eq('id', otpRecord.id);

      return NextResponse.json(
        {
          success: true,
          message: OTP_SUCCESS_MESSAGES.EMAIL_VERIFIED,
        },
        { status: HTTP_STATUS.OK },
      );
    }

    if (action === OTP_ACTION.LOGIN || action === OTP_ACTION.PASSWORD_CHANGE) {
      // OTPレコードに検証済みフラグ設定
      await supabase
        .from('otp_codes')
        .update({ verified_at: now.toISOString() })
        .eq('id', otpRecord.id);

      return NextResponse.json(
        {
          success: true,
          message: OTP_SUCCESS_MESSAGES.CODE_VERIFIED,
        },
        { status: HTTP_STATUS.OK },
      );
    }

    // 想定外のアクション（zodバリデーション通過後のため到達しないはずだが防御的に処理）
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.BAD_REQUEST,
          message: AUTH_ERROR_MESSAGES.VALIDATION_ERROR,
        },
      },
      { status: HTTP_STATUS.BAD_REQUEST },
    );
  } catch (error) {
    console.error('OTP verify error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: OTP_ERROR_MESSAGES.VERIFY_SERVER_ERROR,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
