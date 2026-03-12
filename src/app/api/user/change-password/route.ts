/**
 * パスワード変更API
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
import { HTTP_STATUS, ERROR_CODE } from '@/constants';
import { checkRateLimit, resetRateLimit } from '@/lib/rateLimit/rateLimit';

const RATE_LIMIT_ACTION = 'change_password';

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
      RATE_LIMIT_ACTION,
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

    const { currentPassword, newPassword } = result.data;

    // ユーザー取得
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, password_hash')
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

    // パスワード未設定（ソーシャルログインのみのユーザー）
    if (!user.password_hash) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.BAD_REQUEST,
            message: AUTH_ERROR_MESSAGES.PASSWORD_NOT_SET,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 現在のパスワード照合
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password_hash,
    );

    if (!isCurrentPasswordValid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.BAD_REQUEST,
            message: AUTH_ERROR_MESSAGES.CURRENT_PASSWORD_INCORRECT,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 新旧パスワード同一チェック
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
    await resetRateLimit(supabase, session.user.id, RATE_LIMIT_ACTION);

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
