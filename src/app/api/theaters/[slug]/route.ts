/**
 * 劇場詳細API
 * GET /api/theaters/[slug] - 劇場詳細取得（座席・スピーカー含む）
 *
 * 認証必須（withAuth）。指定slugの劇場データを返す。
 */

import { NextResponse } from 'next/server';

import { withAuth } from '@/helpers/routeHandler';
import {
  notFoundResponse,
  rateLimitExceededResponse,
} from '@/helpers/apiHelpers';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import {
  HTTP_STATUS,
  ERROR_CODE,
  THEATER_MESSAGES,
  THEATERS_DETAIL_SELECT,
  THEATER_SEATS_SELECT,
  THEATER_SPEAKERS_SELECT,
  THEATER_CACHE_CONTROL,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
} from '@/constants';
import { theaterSlugSchema } from '@/schema/theaters';

export const GET = withAuth(
  async ({ session, supabase, params }) => {
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.READ_THEATER_DETAIL,
      RATE_LIMIT_CONFIG.READ_THEATER_DETAIL.maxAttempts,
      RATE_LIMIT_CONFIG.READ_THEATER_DETAIL.windowMinutes,
    );
    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    const resolvedParams = await params;
    const slug = resolvedParams?.slug;

    // slug バリデーション
    const slugResult = theaterSlugSchema.safeParse(slug);
    if (!slugResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.VALIDATION_ERROR,
            message: THEATER_MESSAGES.INVALID_SLUG,
          },
        },
        { status: HTTP_STATUS.BAD_REQUEST },
      );
    }

    // 劇場取得（service_roleはRLSバイパスのため明示的にフィルタ）
    const { data: theater, error: theaterError } = await supabase
      .from('theaters')
      .select(THEATERS_DETAIL_SELECT)
      .eq('slug', slugResult.data)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single();

    if (theaterError || !theater) {
      return notFoundResponse(THEATER_MESSAGES.NOT_FOUND);
    }

    // 座席取得
    const { data: seats, error: seatsError } = await supabase
      .from('theater_seats')
      .select(THEATER_SEATS_SELECT)
      .eq('theater_id', theater.id)
      .order('row_label')
      .order('seat_number');

    if (seatsError) {
      throw seatsError;
    }

    // スピーカー取得
    const { data: speakers, error: speakersError } = await supabase
      .from('theater_speakers')
      .select(THEATER_SPEAKERS_SELECT)
      .eq('theater_id', theater.id);

    if (speakersError) {
      throw speakersError;
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          theater: {
            ...theater,
            seats: seats ?? [],
            speakers: speakers ?? [],
          },
        },
      },
      {
        status: HTTP_STATUS.OK,
        headers: { 'Cache-Control': THEATER_CACHE_CONTROL },
      },
    );
  },
  {
    errorLog: 'Theater detail fetch error',
    errorMessage: THEATER_MESSAGES.FETCH_ERROR,
  },
);
