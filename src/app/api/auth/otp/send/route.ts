/**
 * OTP送信API
 * POST /api/auth/otp/send
 */

import { NextResponse } from 'next/server';

import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import { otpSendSchema } from '@/schema/otp';
import {
  generateOtpCode,
  sendOtpEmail,
  randomDelay,
  hashOtpCode,
} from '@/lib/otp';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import {
  OTP_ACTION,
  OTP_CONFIG,
  OTP_ERROR_MESSAGES,
  OTP_SUCCESS_MESSAGES,
  HTTP_STATUS,
  ERROR_CODE,
  AUTH_ERROR_MESSAGES,
  RATE_LIMIT_ACTION,
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

    const { email: requestedEmail, action } = result.data;

    // 送信先の決定。
    //
    // password_change はログイン中の本人確認が目的なので、宛先はセッションの
    // ユーザー自身に固定する。ボディの email を信用すると、アカウントを1つ持つ
    // だけで任意のアドレスへ自サービス名義の「確認コード」メールを送れてしまい、
    // フィッシングの踏み台・メール爆撃に使える（#641）。
    // 受け取り側の /api/user/change-password もセッションユーザーのメールで
    // 検証済みOTPを引くため、ここを固定することで整合する。
    let email = requestedEmail;

    if (action === OTP_ACTION.PASSWORD_CHANGE) {
      const session = await getAuthSession();
      if (!session) {
        return unauthorizedResponse();
      }

      const { data: sessionUser } = await supabase
        .from('users')
        .select('email')
        .eq('id', session.user.id)
        .single();

      if (!sessionUser) {
        return unauthorizedResponse();
      }

      email = sessionUser.email;
    }

    // 日次送信上限チェック（メールアドレス単位で5通/日）
    const dailyLimitResult = await checkRateLimit(
      supabase,
      email,
      RATE_LIMIT_ACTION.OTP_SEND_DAILY,
      OTP_CONFIG.DAILY_SEND_LIMIT,
      OTP_CONFIG.DAILY_SEND_WINDOW_MINUTES,
    );

    if (!dailyLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
            message: OTP_ERROR_MESSAGES.DAILY_LIMIT_EXCEEDED,
          },
        },
        {
          status: HTTP_STATUS.TOO_MANY_REQUESTS,
          headers: dailyLimitResult.retryAfter
            ? { 'Retry-After': String(dailyLimitResult.retryAfter) }
            : undefined,
        },
      );
    }

    // アクション別チェック
    if (action === OTP_ACTION.REGISTRATION) {
      // 該当メールのユーザーが存在し is_verified = false であること
      const { data: user } = await supabase
        .from('users')
        .select('id, is_verified')
        .eq('email', email)
        .single();

      if (!user) {
        // メール列挙防止: 存在しないメールでも成功レスポンス（遅延付き）
        await randomDelay();
        return NextResponse.json(
          {
            success: true,
            message: OTP_SUCCESS_MESSAGES.CODE_SENT,
          },
          { status: HTTP_STATUS.OK },
        );
      }

      if (user.is_verified) {
        // メール列挙防止: 既に認証済みでも成功レスポンス（遅延付き）
        await randomDelay();
        return NextResponse.json(
          {
            success: true,
            message: OTP_SUCCESS_MESSAGES.CODE_SENT,
          },
          { status: HTTP_STATUS.OK },
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
        // メール列挙防止: 存在しないメールでも成功レスポンス（遅延付き）
        await randomDelay();
        return NextResponse.json(
          {
            success: true,
            message: OTP_SUCCESS_MESSAGES.CODE_SENT,
          },
          { status: HTTP_STATUS.OK },
        );
      }
    }
    // password_change の認証・宛先解決は上部で済ませている（ボディの email を使わない）

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
      // 平文は保存しない。鍵（OTP_HASH_PEPPER）はDBの外に置く（#640）
      code_hash: hashOtpCode(code, email),
      action_type: action,
      expires_at: expiresAt.toISOString(),
    });

    if (insertError) {
      throw insertError;
    }

    // Resendでメール送信
    const emailSent = await sendOtpEmail(email, code, action);

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
