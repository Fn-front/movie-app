/**
 * パスワード再設定API
 * POST /api/auth/password-reset/confirm
 *
 * メールのリンクに載っていたトークンと引き換えにパスワードを再設定する。
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { passwordResetConfirmApiSchema } from '@/schema/auth';
import {
  PASSWORD_RESET_CONFIG,
  PASSWORD_RESET_MESSAGES,
} from '@/constants/passwordReset';
import {
  HTTP_STATUS,
  ERROR_CODE,
  AUTH_ERROR_MESSAGES,
  BCRYPT_COST,
  RATE_LIMIT_ACTION,
} from '@/constants';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { consumePasswordResetToken } from '@/lib/auth/passwordResetToken';
import { getClientIp } from '@/lib/http/getClientIp';

/** トークンが無効・期限切れ・使用済み */
const invalidTokenResponse = () =>
  NextResponse.json(
    {
      success: false,
      error: {
        code: ERROR_CODE.BAD_REQUEST,
        message: PASSWORD_RESET_MESSAGES.INVALID_TOKEN,
      },
    },
    { status: HTTP_STATUS.BAD_REQUEST },
  );

export async function POST(request: Request) {
  try {
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    const body = await request.json();
    const result = passwordResetConfirmApiSchema.safeParse(body);

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

    const { token, password } = result.data;

    // 失敗リクエストを垂れ流させない。
    // トークンは256bitの乱数なので総当たりは成立しないが、送信元単位で止める。
    // 識別子にトークンを使うと、毎回違う値になって制限が機能しない
    const clientIp = getClientIp(request);

    if (clientIp !== 'unknown') {
      const limitResult = await checkRateLimit(
        supabase,
        clientIp,
        RATE_LIMIT_ACTION.PASSWORD_RESET_CONFIRM,
        PASSWORD_RESET_CONFIG.CONFIRM_LIMIT.maxAttempts,
        PASSWORD_RESET_CONFIG.CONFIRM_LIMIT.windowMinutes,
      );

      if (!limitResult.allowed) {
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
            headers: limitResult.retryAfter
              ? { 'Retry-After': String(limitResult.retryAfter) }
              : undefined,
          },
        );
      }
    }

    // トークンの検証と消費を1文で行う。パスワードを更新してから消費すると、
    // 同じリンクを同時に2回開かれたときに両方とも通る
    const userId = await consumePasswordResetToken(supabase, token);

    if (!userId) {
      return invalidTokenResponse();
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, password_hash')
      .eq('id', userId)
      .maybeSingle();

    if (!user) {
      return invalidTokenResponse();
    }

    // 新旧同一チェック。トークンは既に消費済みなので、ここで弾かれた利用者は
    // 再発行が必要になる。パスワードが変わっていないのに
    // password_changed_at を進めてセッションを飛ばすよりは分かりやすい
    if (user.password_hash) {
      const isSamePassword = await bcrypt.compare(password, user.password_hash);

      if (isSamePassword) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODE.BAD_REQUEST,
              message: PASSWORD_RESET_MESSAGES.SAME_PASSWORD,
            },
          },
          { status: HTTP_STATUS.BAD_REQUEST },
        );
      }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    // password_changed_at を更新することで既存セッションが無効化される
    // （src/lib/auth/auth.ts の jwt コールバックが突き合わせている）。
    // リセットは「アカウントを取り戻す」操作なので、奪われていた側の
    // セッションを残してはいけない。
    //
    // 二段階認証（user_totp）には触れない。解除してしまうと、メール受信箱を
    // 押さえただけで第2要素を外せることになり、#642 が塞いだ穴が別経路で開く
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        password_changed_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json(
      { success: true, message: PASSWORD_RESET_MESSAGES.RESET_COMPLETED },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Password reset confirm error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: PASSWORD_RESET_MESSAGES.RESET_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
