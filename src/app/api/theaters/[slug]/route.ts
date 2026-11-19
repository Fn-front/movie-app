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
  SUPABASE_ERROR_CODE,
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

    // 劇場・座席・スピーカーを1往復で取る（#1275）
    //
    // もとは3本を直列に await していた。座席とスピーカーは `theater.id` に
    // しか依存しないので、PostgREST の埋め込み（`theater_seats(...)`）で
    // まとめられる。`theater_seats.theater_id` / `theater_speakers.theater_id`
    // はどちらも `theaters(id)` への FK を持つため関連を推論できる。
    //
    // ⚠️ 並び順は埋め込み側に `referencedTable` を付けないと効かない。
    // もとの `.order('row_label').order('seat_number')` と同じ順序を保つこと
    // （テストで固定している）。
    //
    // service_role は RLS をバイパスするので、`is_active` / `deleted_at` は
    // 明示的に絞る。子テーブルには `deleted_at` が無いので埋め込みで等価。
    const { data: theater, error: theaterError } = await supabase
      .from('theaters')
      .select(
        `${THEATERS_DETAIL_SELECT}, theater_seats(${THEATER_SEATS_SELECT}), theater_speakers(${THEATER_SPEAKERS_SELECT})`,
      )
      .eq('slug', slugResult.data)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('row_label', { referencedTable: 'theater_seats' })
      .order('seat_number', { referencedTable: 'theater_seats' })
      .single();

    // ⚠️ 「行が無い」と「取得に失敗した」を区別する。
    //
    // 1往復にまとめたことで、以前は座席・スピーカーの取得失敗として 500 に
    // なっていた経路もこのエラーに合流する。`PGRST116`（0件）以外を 404 に
    // 倒すと、DB の不調を「劇場が存在しない」と偽って返すことになる。
    if (theaterError && theaterError.code !== SUPABASE_ERROR_CODE.NOT_FOUND) {
      throw theaterError;
    }

    if (!theater) {
      return notFoundResponse(THEATER_MESSAGES.NOT_FOUND);
    }

    const {
      theater_seats: seats,
      theater_speakers: speakers,
      ...theaterFields
    } = theater;

    return NextResponse.json(
      {
        success: true,
        data: {
          theater: {
            ...theaterFields,
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
