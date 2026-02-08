/**
 * 新規登録API
 * POST /api/auth/register
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

import { registerApiSchema } from '@/schema/auth';
import { AUTH_ERROR_MESSAGES, OTP_CONFIG, BCRYPT_COST } from '@/constants/auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * 6桁のOTPコードを生成
 */
function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

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
      .select('id, is_verified')
      .eq('email', email)
      .single();

    // 認証済みユーザーが存在する場合はエラー
    if (existingUser?.is_verified) {
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

    let userId: string;

    if (existingUser) {
      // 未認証ユーザーが存在する場合は上書き更新
      const { error: updateError } = await supabase
        .from('users')
        .update({
          password_hash: passwordHash,
          name: name || null,
        })
        .eq('id', existingUser.id);

      if (updateError) {
        throw updateError;
      }

      // 古いOTPトークンを削除
      await supabase.from('otp_tokens').delete().eq('user_id', existingUser.id);

      userId = existingUser.id;
    } else {
      // 新規ユーザー作成
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          email,
          password_hash: passwordHash,
          name: name || null,
        })
        .select('id')
        .single();

      if (insertError || !newUser) {
        throw insertError;
      }

      userId = newUser.id;
    }

    // OTP生成・保存
    const otp = generateOtp();
    const expiresAt = new Date(
      Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000,
    );

    const { error: otpError } = await supabase.from('otp_tokens').insert({
      user_id: userId,
      token: otp,
      expires_at: expiresAt.toISOString(),
    });

    if (otpError) {
      throw otpError;
    }

    // TODO: メール送信（次のPRで実装）
    // 開発環境ではOTPをログに出力
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] OTP for ${email}: ${otp}`);
    }

    return NextResponse.json(
      {
        success: true,
        data: { userId },
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
