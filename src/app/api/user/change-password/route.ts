/**
 * パスワード変更API
 * POST /api/user/change-password
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

import { auth } from '@/lib/auth/auth';
import { changePasswordApiSchema } from '@/schema/auth';
import { AUTH_ERROR_MESSAGES, BCRYPT_COST } from '@/constants/auth';
import { HTTP_STATUS } from '@/constants';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: Request) {
  try {
    // 認証チェック
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: AUTH_ERROR_MESSAGES.UNAUTHORIZED,
          },
        },
        { status: HTTP_STATUS.UNAUTHORIZED },
      );
    }

    // Supabaseクライアント検証
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVER_ERROR',
            message: AUTH_ERROR_MESSAGES.DB_CONNECTION_ERROR,
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // リクエストボディの取得・バリデーション
    const body = await request.json();
    const result = changePasswordApiSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
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
            code: 'SERVER_ERROR',
            message: AUTH_ERROR_MESSAGES.PASSWORD_CHANGE_FAILED,
          },
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
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
            code: 'BAD_REQUEST',
            message: AUTH_ERROR_MESSAGES.CURRENT_PASSWORD_INCORRECT,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 新パスワードハッシュ化
    const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

    // パスワード更新
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: newPasswordHash })
      .eq('id', session.user.id);

    if (updateError) {
      throw updateError;
    }

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
          code: 'SERVER_ERROR',
          message: AUTH_ERROR_MESSAGES.PASSWORD_CHANGE_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
