/**
 * ウォッチリスト個別操作API
 * DELETE /api/watchlist/:id - ウォッチリストから削除（論理削除）
 */

import { NextResponse } from 'next/server';

import { isValidUuid, invalidUuidResponse } from '@/helpers/requestValidation';
import { withAuth } from '@/helpers/routeHandler';
import {
  softDeleteById,
  notFoundResponse,
  rateLimitExceededResponse,
} from '@/helpers/apiHelpers';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import {
  HTTP_STATUS,
  WATCHLIST_ERROR_MESSAGES,
  WATCHLIST_SUCCESS_MESSAGES,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';

export const DELETE = withAuth(
  async ({ session, supabase, params }) => {
    // 対になる favorites/[id] は PATCH / DELETE の両方に制限があるのに
    // watchlist 側だけ抜けていた。追加は POST（watchlist/route.ts）と
    // 同じ write_api_watchlist を共有する
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.WRITE_WATCHLIST,
      RATE_LIMIT_CONFIG.WRITE_WATCHLIST.maxAttempts,
      RATE_LIMIT_CONFIG.WRITE_WATCHLIST.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

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
