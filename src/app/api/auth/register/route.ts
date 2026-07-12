/**
 * 新規登録API
 * POST /api/auth/register
 *
 * is_verified = false でユーザー作成し、OTPコードを生成・メール送信する。
 * OTP検証成功後に is_verified = true に更新される。
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { registerApiSchema } from '@/schema/auth';
import { AUTH_ERROR_MESSAGES, BCRYPT_COST } from '@/constants/auth';
import { OTP_CONFIG, OTP_ERROR_MESSAGES } from '@/constants/otp';
import { HTTP_STATUS, ERROR_CODE } from '@/constants';
import { generateOtpCode, sendOtpEmail, randomDelay } from '@/lib/otp';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';

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
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // レート制限チェック（email単位で5回/60分）
    const rateLimitResult = await checkRateLimit(
      supabase,
      result.data.email,
      'register',
      5,
      60,
    );

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.RATE_LIMIT_EXCEEDED,
            message: AUTH_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
          },
        },
        {
          status: HTTP_STATUS.TOO_MANY_REQUESTS,
          headers: rateLimitResult.retryAfter
            ? { 'Retry-After': String(rateLimitResult.retryAfter) }
            : undefined,
        },
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
      // メールアドレス列挙防止:
      // 既存メールでも新規登録と区別できないレスポンスを返す。
      // - 内部では新規ユーザー・OTPを作成せず、メールも送信しない
      // - bcryptハッシュ計算＋ランダム遅延で新規作成時とタイミングを揃える
      //   （新規成功パスも同じ randomDelay() を通す。詳細は下記コメント参照）
      // - レスポンスは 201・同一ボディ形状（userId はダミーのUUID）
      await bcrypt.hash(password, BCRYPT_COST);
      await randomDelay();

      return NextResponse.json(
        {
          success: true,
          data: { userId: randomUUID() },
          message: AUTH_ERROR_MESSAGES.REGISTER_SUCCESS,
        },
        { status: HTTP_STATUS.CREATED },
      );
    }

    // パスワードハッシュ化
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    // 新規ユーザー作成（未認証状態で作成）
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        name: name || null,
        is_verified: false,
      })
      .select('id')
      .single();

    if (insertError || !newUser) {
      throw insertError;
    }

    // OTPコードを生成・保存
    const code = generateOtpCode();
    const expiresAt = new Date(
      Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000,
    );

    const { error: otpInsertError } = await supabase.from('otp_codes').insert({
      email,
      code,
      action_type: 'registration',
      expires_at: expiresAt.toISOString(),
    });

    if (otpInsertError) {
      throw otpInsertError;
    }

    // Resendでメール送信
    const emailSent = await sendOtpEmail(email, code);

    if (!emailSent) {
      // メール送信失敗時はユーザー・OTPレコードを削除（ロールバック）
      await Promise.all([
        supabase.from('otp_codes').delete().eq('email', email),
        supabase.from('users').delete().eq('id', newUser.id),
      ]);

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

    // メールアドレス列挙防止（タイミング均一化）:
    // 既存メール分岐と同じ randomDelay() を新規成功パスでも通し、
    // 両パスの応答時間にジッターを持たせて分布を近づける。
    //
    // 【残る限界】完全なタイミング一致は困難:
    // - 既存メール分岐は SELECT 1回のみ、新規成功パスは users/otp_codes への
    //   INSERT と sendOtpEmail(Resend) の実処理を伴うため、DB・外部メール送信の
    //   実所要時間の差は randomDelay() のジッター（200〜500ms）で吸収しきれない
    //   場合がある。この差の完全な隠蔽は本実装のスコープ外とする。
    await randomDelay();

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
