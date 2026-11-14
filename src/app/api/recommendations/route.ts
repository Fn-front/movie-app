/**
 * レコメンド一覧取得API
 * GET /api/recommendations
 *
 * ホーム（`/`）を静的プリレンダに保つため、サーバーで取っていた
 * レコメンドをクライアント取得へ移した受け口（#1115）。
 */

import { NextResponse } from 'next/server';

import {
  HTTP_STATUS,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
  RECOMMENDATIONS_MESSAGES,
} from '@/constants';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { withAuth } from '@/helpers/routeHandler';
import { fetchRecommendationData } from '@/lib/api/recommendations/recommendationData';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';

export const GET = withAuth(
  async ({ session, supabase }) => {
    // 原則どおり、識別子（session.user.id）が確定した直後・検証より前に置く。
    // このルートに入力の検証は無い（`.claude/rules/api-route.md`）
    const rateLimitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.READ_USER_DATA,
      RATE_LIMIT_CONFIG.READ_USER_DATA.maxAttempts,
      RATE_LIMIT_CONFIG.READ_USER_DATA.windowMinutes,
    );

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult);
    }

    const data = await fetchRecommendationData(supabase, session.user.id);

    return NextResponse.json(
      { success: true, data },
      { status: HTTP_STATUS.OK },
    );
  },
  {
    errorLog: 'Recommendations fetch error',
    errorMessage: RECOMMENDATIONS_MESSAGES.FETCH_FAILED,
  },
);
