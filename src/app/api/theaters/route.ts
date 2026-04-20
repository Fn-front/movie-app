/**
 * 劇場API
 * GET /api/theaters - 劇場一覧取得
 *
 * 認証必須（withAuth）。アクティブな劇場の一覧を返す。
 */

import { NextResponse } from 'next/server';

import { withAuth } from '@/helpers/routeHandler';
import {
  HTTP_STATUS,
  THEATER_MESSAGES,
  THEATERS_LIST_SELECT,
  THEATER_CACHE_CONTROL,
} from '@/constants';

export const GET = withAuth(
  async ({ supabase }) => {
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
