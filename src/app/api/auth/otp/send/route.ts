/**
 * OTP送信API
 * POST /api/auth/otp/send
 */

import { NextResponse } from 'next/server';

import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { getAuthSession } from '@/helpers/auth';
import { otpSendSchema } from '@/schema/otp';
import { generateOtpCode, sendOtpEmail } from '@/lib/otp';
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
    const result = otpSendSchema.safeParse(body);

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

    const { email, action } = result.data;

    // アクション別チェック
    if (action === OTP_ACTION.REGISTRATION) {
      // 該当メールのユーザーが存在し is_verified = false であること
      const { data: user } = await supabase
        .from('users')
        .select('id, is_verified')
        .eq('email', email)
        .single();

      if (!user) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODE.NOT_FOUND,
              message: OTP_ERROR_MESSAGES.USER_NOT_FOUND,
            },
          },
          { status: HTTP_STATUS.NOT_FOUND },
        );
      }

      if (user.is_verified) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODE.BAD_REQUEST,
              message: OTP_ERROR_MESSAGES.ALREADY_VERIFIED,
            },
          },
          { status: HTTP_STATUS.BAD_REQUEST },
        );
      }
    } else if (action === OTP_ACTION.LOGIN) {
      // 該当メールのユーザーが存在すること
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (!user) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODE.NOT_FOUND,
              message: OTP_ERROR_MESSAGES.USER_NOT_FOUND,
            },
          },
          { status: HTTP_STATUS.NOT_FOUND },
        );
      }
    } else if (action === OTP_ACTION.PASSWORD_CHANGE) {
      // ログイン済みセッション必須
      const session = await getAuthSession();
      if (!session) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODE.UNAUTHORIZED,
              message: AUTH_ERROR_MESSAGES.UNAUTHORIZED,
            },
          },
          { status: HTTP_STATUS.UNAUTHORIZED },
        );
      }
    }

    // 前回送信から1分以上経過しているかチェック
    const { data: recentOtp } = await supabase
      .from('otp_codes')
      .select('created_at')
      .eq('email', email)
      .eq('action_type', action)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (recentOtp) {
      const lastSentAt = new Date(recentOtp.created_at);
      const now = new Date();
      const diffSeconds = (now.getTime() - lastSentAt.getTime()) / 1000;

      if (diffSeconds < OTP_CONFIG.RESEND_INTERVAL_SECONDS) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
              message: OTP_ERROR_MESSAGES.RESEND_TOO_SOON,
            },
          },
          { status: HTTP_STATUS.TOO_MANY_REQUESTS },
        );
      }
    }

    // 既存の未使用OTPを無効化（削除）
    await supabase
      .from('otp_codes')
      .delete()
      .eq('email', email)
      .eq('action_type', action)
      .is('verified_at', null);

    // 新しいOTPコードを生成・保存
    const code = generateOtpCode();
    const expiresAt = new Date(
      Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000,
    );

    const { error: insertError } = await supabase.from('otp_codes').insert({
      email,
      code,
      action_type: action,
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      throw insertError;
    }

    // Resendでメール送信
    const emailSent = await sendOtpEmail(email, code);

    if (!emailSent) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.SERVER_ERROR,
            message: OTP_ERROR_MESSAGES.EMAIL_SEND_FAILED,
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: OTP_SUCCESS_MESSAGES.CODE_SENT,
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('OTP send error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: OTP_ERROR_MESSAGES.EMAIL_SEND_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
