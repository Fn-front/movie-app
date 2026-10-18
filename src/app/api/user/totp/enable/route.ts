/**
 * 二段階認証の有効化API
 * POST /api/user/totp/enable
 *
 * 認証アプリに表示されている初回コードを検証し、成功した場合だけ有効化する。
 * QRを表示しただけで有効にすると、登録に失敗した利用者がロックアウトされる。
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { confirmTotpSetup } from '@/lib/auth/totpSetup';
import { checkRateLimit, resetRateLimit } from '@/lib/rateLimit/rateLimit';
import { totpEnableSchema } from '@/schema/totp';
import { HTTP_STATUS, ERROR_CODE, RATE_LIMIT_ACTION } from '@/constants';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { TOTP_ERROR_MESSAGES, TOTP_SETTINGS_LIMIT } from '@/constants/totp';

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    const body = await request.json();
    const result = totpEnableSchema.safeParse(body);

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

    // 6桁 = 100万通り。上限が無いと総当たりで有効化できてしまう
    const limitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.TOTP_VERIFY,
      TOTP_SETTINGS_LIMIT.maxAttempts,
      TOTP_SETTINGS_LIMIT.windowMinutes,
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
        { status: HTTP_STATUS.TOO_MANY_REQUESTS },
      );
    }

    const recoveryCodes = await confirmTotpSetup(
      supabase,
      session.user.id,
      result.data.code,
    );

    if (!recoveryCodes) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.BAD_REQUEST,
            message: TOTP_ERROR_MESSAGES.INVALID_CODE,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    await resetRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.TOTP_VERIFY,
    );

    return NextResponse.json(
      {
        success: true,
        message: TOTP_ERROR_MESSAGES.ENABLED,
        // 平文はここでしか返さない。利用者が控えそこねたら再発行してもらう
        data: { recoveryCodes },
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('TOTP enable error:', error);

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
