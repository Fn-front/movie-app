/**
 * パスワード変更API（OTP検証ベース）
 * POST /api/user/change-password
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { changePasswordApiSchema } from '@/schema/auth';
import { AUTH_ERROR_MESSAGES, BCRYPT_COST } from '@/constants/auth';
import { HTTP_STATUS, ERROR_CODE, RATE_LIMIT_ACTION } from '@/constants';
import { OTP_ACTION, OTP_CONFIG, OTP_ERROR_MESSAGES } from '@/constants/otp';
import { checkRateLimit, resetRateLimit } from '@/lib/rateLimit/rateLimit';

export async function POST(request: Request) {
  try {
    // 認証チェック
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    // Supabaseクライアント検証
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // レート制限チェック
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.CHANGE_PASSWORD,
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

    // リクエストボディの取得・バリデーション
    const body = await request.json();
    const result = changePasswordApiSchema.safeParse(body);

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

    const { newPassword } = result.data;

    // ユーザー取得
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, email, password_hash')
      .eq('id', session.user.id)
      .single();

    if (fetchError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.SERVER_ERROR,
            message: AUTH_ERROR_MESSAGES.PASSWORD_CHANGE_FAILED,
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
      );
    }

    // OTP検証チェック: otp_codesで検証済みOTPの存在確認
    const { data: verifiedOtp } = await supabase
      .from('otp_codes')
      .select('id, verified_at')
      .eq('email', user.email)
      .eq('action_type', OTP_ACTION.PASSWORD_CHANGE)
      .not('verified_at', 'is', null)
      .order('verified_at', { ascending: false })
      .limit(1)
      .single();

    if (!verifiedOtp) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.BAD_REQUEST,
            message: OTP_ERROR_MESSAGES.OTP_NOT_VERIFIED,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 検証済みOTPの有効期限チェック（verified_atから5分以内）
    const verifiedAt = new Date(verifiedOtp.verified_at).getTime();
    const expiryMs = OTP_CONFIG.VERIFIED_TOKEN_EXPIRY_MINUTES * 60 * 1000;

    if (Date.now() - verifiedAt > expiryMs) {
      // 期限切れのOTPを削除
      await supabase.from('otp_codes').delete().eq('id', verifiedOtp.id);

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

    // 新旧パスワード同一チェック（パスワードが設定されている場合のみ）
    if (user.password_hash) {
      const isSamePassword = await bcrypt.compare(
        newPassword,
        user.password_hash,
      );

      if (isSamePassword) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODE.BAD_REQUEST,
              message: AUTH_ERROR_MESSAGES.SAME_PASSWORD,
            },
          },
          { status: HTTP_STATUS.BAD_REQUEST },
        );
      }
    }

    // 検証済みOTPを先に削除（TOCTOU対策: パスワード更新前にOTPを無効化）
    await supabase.from('otp_codes').delete().eq('id', verifiedOtp.id);

    // 新パスワードハッシュ化
    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

    // パスワード更新 + password_changed_at を記録
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: newPasswordHash,
        password_changed_at: new Date().toISOString(),
      })
      .eq('id', session.user.id);

    if (updateError) {
      throw updateError;
    }

    // レート制限リセット（成功時）
    await resetRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.CHANGE_PASSWORD,
    );

    return NextResponse.json(
      {
        success: true,
        message: AUTH_ERROR_MESSAGES.PASSWORD_CHANGED,
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Change password error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: AUTH_ERROR_MESSAGES.PASSWORD_CHANGE_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
