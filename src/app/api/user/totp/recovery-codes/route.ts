/**
 * リカバリーコードの再発行API
 * POST /api/user/totp/recovery-codes
 *
 * 無効化と同じく所持の証明を要求する。これが通ると以前のコードは
 * すべて使えなくなるため、第三者に実行されると復旧手段を奪われる。
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { requireSecondFactor } from '@/helpers/totpGuard';
import { regenerateRecoveryCodes } from '@/lib/auth/totpSetup';
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

    const recoveryCodes = await regenerateRecoveryCodes(
      supabase,
      session.user.id,
    );

    return NextResponse.json(
      {
        success: true,
        message: TOTP_ERROR_MESSAGES.RECOVERY_CODES_REGENERATED,
        data: { recoveryCodes },
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('TOTP recovery codes error:', error);

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
