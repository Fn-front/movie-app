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
} from '@/constants';

/** 認証ユーザー単位の読み取りレート制限: 30 回 / 1 分 */
const RATE_LIMIT_ACTION = 'read_api_theaters';
const RATE_LIMIT_MAX_ATTEMPTS = 30;
const RATE_LIMIT_WINDOW_MINUTES = 1;

export const GET = withAuth(
  async ({ session, supabase }) => {
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION,
      RATE_LIMIT_MAX_ATTEMPTS,
      RATE_LIMIT_WINDOW_MINUTES,
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
