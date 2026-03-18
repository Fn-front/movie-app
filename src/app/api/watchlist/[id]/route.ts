/**
 * ウォッチリスト個別操作API
 * DELETE /api/watchlist/:id - ウォッチリストから削除（論理削除）
 */

import { NextResponse } from 'next/server';

import { getAuthSession, unauthorizedResponse } from '@/helpers/auth';
import {
  createServiceRoleClient,
  dbConnectionErrorResponse,
} from '@/helpers/supabase';
import { isValidUuid, invalidUuidResponse } from '@/helpers/requestValidation';
import {
  HTTP_STATUS,
  ERROR_CODE,
  WATCHLIST_ERROR_MESSAGES,
  WATCHLIST_SUCCESS_MESSAGES,
} from '@/constants';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // 認証チェック
    const session = await getAuthSession();
    if (!session) return unauthorizedResponse();

    // Supabaseクライアント検証
    const supabase = createServiceRoleClient();
    if (!supabase) return dbConnectionErrorResponse();

    const { id } = await params;

    // UUID形式チェック
    if (!isValidUuid(id)) {
      return invalidUuidResponse(WATCHLIST_ERROR_MESSAGES.INVALID_ID);
    }

    // 論理削除（自分のウォッチリストかつ未削除のもののみ）
    const { data, error } = await supabase
      .from('watchlist')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', session.user.id)
      .is('deleted_at', null)
      .select('id')
      .single();

    if (error || !data) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.NOT_FOUND,
            message: WATCHLIST_ERROR_MESSAGES.NOT_FOUND,
          },
        },
        { status: HTTP_STATUS.NOT_FOUND },
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: WATCHLIST_SUCCESS_MESSAGES.REMOVED,
      },
      { status: HTTP_STATUS.OK },
    );
  } catch (error) {
    console.error('Watchlist remove error:', error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODE.SERVER_ERROR,
          message: WATCHLIST_ERROR_MESSAGES.REMOVE_FAILED,
        },
      },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR },
    );
  }
}
