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
  isTotpEnabled,
} from '@/lib/auth/totpVerification';
import { HTTP_STATUS, ERROR_CODE } from '@/constants';
import { TOTP_ERROR_MESSAGES } from '@/constants/totp';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    const enabled = await isTotpEnabled(supabase, session.user.id);

    return NextResponse.json(
      {
        success: true,
        data: {
          enabled,
          // 残数は有効時のみ意味がある。無効なら0を返す
          remainingRecoveryCodes: enabled
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
