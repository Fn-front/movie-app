/**
 * 劇場API
 * GET /api/theaters - 劇場一覧取得
 *
 * 認証必須（withAuth）。アクティブな劇場の一覧を返す。
 */

import { NextResponse } from 'next/server';

import { withAuth } from '@/helpers/routeHandler';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import {
  HTTP_STATUS,
  THEATER_MESSAGES,
  THEATERS_LIST_SELECT,
  THEATER_CACHE_CONTROL,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';

export const GET = withAuth(
  async ({ session, supabase }) => {
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.READ_THEATERS,
      RATE_LIMIT_CONFIG.READ_THEATERS.maxAttempts,
      RATE_LIMIT_CONFIG.READ_THEATERS.windowMinutes,
    );
    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    const { data, error } = await supabase
      .from('theaters')
      .select(THEATERS_LIST_SELECT)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name');

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        success: true,
        data: { theaters: data ?? [] },
      },
      {
        status: HTTP_STATUS.OK,
        headers: { 'Cache-Control': THEATER_CACHE_CONTROL },
      },
    );
  },
  {
    errorLog: 'Theaters fetch error',
    errorMessage: THEATER_MESSAGES.FETCH_ERROR,
  },
);
