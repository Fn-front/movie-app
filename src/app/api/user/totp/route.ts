/**
 * 二段階認証の状態取得API
 * GET /api/user/totp
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import {
  countUnusedRecoveryCodes,
  getSecondFactorMethod,
} from '@/lib/auth/secondFactor';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import {
  HTTP_STATUS,
  ERROR_CODE,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { TOTP_ERROR_MESSAGES } from '@/constants/totp';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // レート制限チェック（#934）
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.READ_USER_DATA,
      RATE_LIMIT_CONFIG.READ_USER_DATA.maxAttempts,
      RATE_LIMIT_CONFIG.READ_USER_DATA.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    const method = await getSecondFactorMethod(supabase, session.user.id);

    // `username`: admin が発行したアカウントは `users.email` が `.invalid` TLD
    //   （RFC 2606、絶対に名前解決されない）なので、メールOTP を選ばせない。
    //   画面に選択肢を出さないための判定材料として返す
    //
    // `password_hash`: 再認証でどちらの材料を求めるかの判定材料（#1372）。
    //   `requireReauth`（`src/helpers/reauthGuard.ts`）がこの列の実値で
    //   決めているので、画面も同じ列を見ないとズレる
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('username, password_hash')
      .eq('id', session.user.id)
      .single();

    // 読み取りに失敗しただけで 401 を返さない。下の catch で 500 にする
    if (userError) throw userError;

    return NextResponse.json(
      {
        success: true,
        data: {
          enabled: Boolean(method),
          // 有効な方式。無効なら null
          method,
          // メールOTP を選べるか（admin 発行アカウントは選べない）
          emailOtpAvailable: !user?.username,
          // 再認証でパスワードを求められるか（#1372）
          //
          // ⛔ ハッシュそのものを返さない。画面が要るのは有無だけで、
          //    値を渡すと総当たりの的を手渡すことになる
          hasPassword: Boolean(user?.password_hash),
          // 残数は有効時のみ意味がある。無効なら0を返す
          remainingRecoveryCodes: method
            ? await countUnusedRecoveryCodes(supabase, session.user.id)
            : 0,
        },
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('TOTP status error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: TOTP_ERROR_MESSAGES.OPERATION_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
