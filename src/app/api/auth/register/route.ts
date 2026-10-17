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
import { OTP_ACTION, OTP_CONFIG, OTP_ERROR_MESSAGES } from '@/constants/otp';
import {
  HTTP_STATUS,
  ERROR_CODE,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import {
  generateOtpCode,
  sendOtpEmail,
  randomDelay,
  hashOtpCode,
} from '@/lib/otp';
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
      RATE_LIMIT_ACTION.REGISTER,
      RATE_LIMIT_CONFIG.REGISTER.maxAttempts,
      RATE_LIMIT_CONFIG.REGISTER.windowMinutes,
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

    // 既存ユーザーチェック（is_verified も見る）
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, is_verified')
      .eq('email', email)
      .single();

    if (existingUser?.is_verified) {
      // メールアドレス列挙防止:
      // 認証済みメールでも新規登録と区別できないレスポンスを返す。
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

    // 未検証の既存ユーザーがいる場合は上書きし、いなければ新規作成する。
    //
    // 「既存あり」で一律に何もせず成功レスポンスを返していると、第三者が
    // 他人のメールで先に未検証登録するだけで、本人が二度と登録できなくなる
    // （しかも列挙防止のため理由を表示できない）。さらに、本人がフィッシング等で
    // 確認コードを入力してしまうと is_verified=true になり、第三者が設定した
    // パスワードでログインできてしまう（#645）。
    //
    // 上書きすることで、(1) 本人は普通に登録を完了でき、(2) 第三者が設定した
    // password_hash が消えるため乗っ取り経路も塞がる。確認コードを受け取れるのは
    // メールアドレスの持ち主だけなので、第三者が繰り返しても意味がない。
    let userId: string;

    if (existingUser) {
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          password_hash: passwordHash,
          name: name || null,
        })
        .eq('id', existingUser.id)
        .select('id')
        .single();

      if (updateError || !updatedUser) {
        throw updateError;
      }

      userId = updatedUser.id;

      // 旧い未検証OTPを無効化し、有効なコードを1つに保つ
      await supabase
        .from('otp_codes')
        .delete()
        .eq('email', email)
        .eq('action_type', OTP_ACTION.REGISTRATION)
        .is('verified_at', null);
    } else {
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

      userId = newUser.id;
    }

    // OTPコードを生成・保存
    const code = generateOtpCode();
    const expiresAt = new Date(
      Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000,
    );

    const { error: otpInsertError } = await supabase.from('otp_codes').insert({
      email,
      // 平文は保存しない（#640）
      code_hash: hashOtpCode(code, email),
      action_type: OTP_ACTION.REGISTRATION,
      expires_at: expiresAt.toISOString(),
    });

    if (otpInsertError) {
      throw otpInsertError;
    }

    // Resendでメール送信
    const emailSent = await sendOtpEmail(email, code, OTP_ACTION.REGISTRATION);

    if (!emailSent) {
      // メール送信失敗時はロールバックする。
      // users 行を消すのは「このリクエストで作成した場合」のみ。既存の未検証
      // ユーザーを上書きしたケースで消すと、元々あった行まで巻き添えになる
      await supabase.from('otp_codes').delete().eq('email', email);

      if (!existingUser) {
        await supabase.from('users').delete().eq('id', userId);
      }

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
        data: { userId },
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
