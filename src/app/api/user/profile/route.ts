/**
 * 表示名更新API
 * PUT /api/user/profile
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { updateProfileSchema } from '@/schema/user';
import {
  HTTP_STATUS,
  ERROR_CODE,
  PROFILE_ERROR_MESSAGES,
  PROFILE_SUCCESS_MESSAGES,
  API_ERROR_MESSAGES,
} from '@/constants';

export async function PUT(request: Request) {
  try {
    // 認証チェック
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    // Supabaseクライアント検証
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    // リクエストボディの取得・バリデーション
    const body = await request.json();
    const result = updateProfileSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: API_ERROR_MESSAGES.VALIDATION_ERROR,
            details: result.error.flatten().fieldErrors,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    const { name } = result.data;

    // 表示名更新
    const { error: updateError } = await supabase
      .from('users')
      .update({ name })
      .eq('id', session.user.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json(
      {
        success: true,
        message: PROFILE_SUCCESS_MESSAGES.UPDATED,
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Update profile error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: PROFILE_ERROR_MESSAGES.UPDATE_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
