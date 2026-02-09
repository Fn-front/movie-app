/**
 * 新規登録API
 * POST /api/auth/register
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { registerApiSchema } from '@/schema/auth';
import { AUTH_ERROR_MESSAGES, BCRYPT_COST } from '@/constants/auth';
import { HTTP_STATUS, ERROR_CODE } from '@/constants';

export async function POST(request: Request) {
  try {
    // Supabaseクライアント検証
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // リクエストボディの取得・バリデーション
    const body = await request.json();
    const result = registerApiSchema.safeParse(body);

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

    const { email, password, name } = result.data;

    // 既存ユーザーチェック
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.CONFLICT,
            message: AUTH_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS,
          },
        },
        { status: HTTP_STATUS.CONFLICT },
      );
    }

    // パスワードハッシュ化
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    // 新規ユーザー作成（即時認証済み）
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        name: name || null,
        is_verified: true,
      })
      .select('id')
      .single();

    if (insertError || !newUser) {
      throw insertError;
    }

    return NextResponse.json(
      {
        success: true,
        data: { userId: newUser.id },
        message: AUTH_ERROR_MESSAGES.REGISTER_SUCCESS,
      },
      { status: HTTP_STATUS.CREATED },
    );
  } catch (error) {
    console.error('Registration error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: AUTH_ERROR_MESSAGES.REGISTER_SERVER_ERROR,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
