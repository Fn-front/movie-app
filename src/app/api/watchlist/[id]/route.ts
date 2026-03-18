/**
 * ウォッチリスト個別操作API
 * DELETE /api/watchlist/:id - ウォッチリストから削除（論理削除）
 */

import { NextResponse } from 'next/server';

import { isValidUuid, invalidUuidResponse } from '@/helpers/requestValidation';
import { withAuth } from '@/helpers/routeHandler';
import { softDeleteById, notFoundResponse } from '@/helpers/apiHelpers';
import {
  HTTP_STATUS,
  WATCHLIST_ERROR_MESSAGES,
  WATCHLIST_SUCCESS_MESSAGES,
} from '@/constants';

export const DELETE = withAuth(
  async ({ session, supabase, params }) => {
    const { id } = await params!;

    if (!isValidUuid(id)) {
      return invalidUuidResponse(WATCHLIST_ERROR_MESSAGES.INVALID_ID);
    }

    const success = await softDeleteById(
      supabase,
      'watchlist',
      id,
      session.user.id,
    );
    if (!success) return notFoundResponse(WATCHLIST_ERROR_MESSAGES.NOT_FOUND);

    return NextResponse.json(
      { success: true, message: WATCHLIST_SUCCESS_MESSAGES.REMOVED },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Watchlist remove error',
    errorMessage: WATCHLIST_ERROR_MESSAGES.REMOVE_FAILED,
  },
);
