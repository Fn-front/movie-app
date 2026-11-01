/**
 * 指定した賞・年に既に入っている受賞作品の件数
 * GET /api/admin/awards/existing?awardName=cannes&year=2024
 *
 * 同期画面で「この年は既に N 件あります」と知らせるためだけの読み取り。
 * **同期そのものは件数で弾かない**（手動同期は取り直しが主目的のため）。
 *
 * ⚠️ 公開の `/api/awards` を流用しない。あちらは `public, s-maxage=3600` で
 * キャッシュされるため、同期直後でも古い件数を返しうる。「まだ入っていない」と
 * 誤解させるのはこの機能の目的と正反対になる。
 *
 * admin ロール必須。設計: `.claude/documents/admin-award-sync-design.md`
 */

import { NextResponse } from 'next/server';

import { withAdminAuth } from '@/helpers/adminAuth';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import {
  AWARD_SYNC_MESSAGES,
  AWARD_SYNC_MIN_YEAR,
  SYNCABLE_AWARD_NAMES,
  type SyncableAwardName,
} from '@/constants/awardSync';
import {
  HTTP_STATUS,
  ERROR_CODE,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
  CACHE_CONTROL,
} from '@/constants';

function badRequest(message: string) {
  return NextResponse.json(
    { success: false, error: { code: ERROR_CODE.VALIDATION_ERROR, message } },
    {
      status: HTTP_STATUS.BAD_REQUEST,
      headers: { 'Cache-Control': CACHE_CONTROL.PRIVATE_NO_STORE },
    },
  );
}

export const GET = withAdminAuth(
  async ({ session, supabase, request }) => {
    // ポーリングと同じカウンタを共有する。デバウンス済みで呼び出し頻度が低く、
    // ポーリング（最大300回/25分）に対して上限600回/30分の余裕に収まるため、
    // 専用アクションを切って chk_action_type のマイグレーションを増やさない
    const limitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.ADMIN_AWARD_SYNC_STATUS,
      RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC_STATUS.maxAttempts,
      RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC_STATUS.windowMinutes,
    );

    if (!limitResult.allowed) {
      return rateLimitExceededResponse(limitResult);
    }

    const { searchParams } = new URL(request.url);
    const awardName = searchParams.get('awardName');
    const yearParam = searchParams.get('year');

    if (
      !awardName ||
      !(SYNCABLE_AWARD_NAMES as readonly string[]).includes(awardName)
    ) {
      return badRequest(AWARD_SYNC_MESSAGES.INVALID_BODY);
    }

    const year = Number(yearParam);

    if (!yearParam || !Number.isInteger(year)) {
      return badRequest(AWARD_SYNC_MESSAGES.INVALID_BODY);
    }

    const minYear = AWARD_SYNC_MIN_YEAR[awardName as SyncableAwardName];
    const maxYear = new Date().getFullYear() + 1;

    if (year < minYear || year > maxYear) {
      return badRequest(AWARD_SYNC_MESSAGES.INVALID_BODY);
    }

    const { count, error } = await supabase
      .from('award_movies')
      .select('tmdb_movie_id', { count: 'exact', head: true })
      .eq('award_name', awardName)
      .eq('award_year', year);

    if (error) {
      console.error(
        `[awardSync] 既存件数の取得に失敗しました award=${awardName} year=${year}`,
        error,
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODE.SERVER_ERROR,
            message: AWARD_SYNC_MESSAGES.FETCH_ERROR,
          },
        },
        {
          status: HTTP_STATUS.INTERNAL_SERVER_ERROR,
          headers: { 'Cache-Control': CACHE_CONTROL.PRIVATE_NO_STORE },
        },
      );
    }

    return NextResponse.json(
      { success: true, data: { count: count ?? 0 } },
      {
        status: HTTP_STATUS.OK,
        headers: { 'Cache-Control': CACHE_CONTROL.PRIVATE_NO_STORE },
      },
    );
  },
  {
    errorLog: 'Award existing count fetch error',
    errorMessage: AWARD_SYNC_MESSAGES.FETCH_ERROR,
  },
);
