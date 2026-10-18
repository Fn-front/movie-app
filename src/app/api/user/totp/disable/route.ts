/**
 * 二段階認証の無効化API
 * POST /api/user/totp/disable
 *
 * 所持の証明（認証アプリのコード or リカバリーコード）を要求する。
 * セッションだけで外せたら、セッションを奪った第三者がそのまま
 * 第2要素を無効化できてしまう。
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { requireSecondFactor } from '@/helpers/totpGuard';
import { disableTotp } from '@/lib/auth/totpSetup';
import { totpVerifySchema } from '@/schema/totp';
import { HTTP_STATUS, ERROR_CODE } from '@/constants';
import { AUTH_ERROR_MESSAGES } from '@/constants/auth';
import { TOTP_ERROR_MESSAGES } from '@/constants/totp';

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    const body = await request.json();
    const result = totpVerifySchema.safeParse(body);

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

    const guardResponse = await requireSecondFactor(
      supabase,
      session.user.id,
      result.data.code,
    );

    if (guardResponse) return guardResponse;

    await disableTotp(supabase, session.user.id);

    return NextResponse.json(
      { success: true, message: TOTP_ERROR_MESSAGES.DISABLED },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('TOTP disable error:', error);

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
