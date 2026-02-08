/**
 * 新規登録API
 * POST /api/auth/register
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

import { registerApiSchema } from '@/schema/auth';
import { AUTH_ERROR_MESSAGES, BCRYPT_COST } from '@/constants/auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: Request) {
  try {
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
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // リクエストボディの取得・バリデーション
    const body = await request.json();
    const result = registerApiSchema.safeParse(body);

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
        { status: 400 },
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
            code: 'CONFLICT',
            message: AUTH_ERROR_MESSAGES.EMAIL_ALREADY_EXISTS,
          },
        },
        { status: 409 },
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
      { status: 201 },
    );
  } catch (error) {
    console.error('Registration error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: '登録処理中にエラーが発生しました。',
        },
      },
      { status: 500 },
    );
  }
}
