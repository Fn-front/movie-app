/**
 * 受賞作品の手動同期ジョブの進捗取得 API
 * GET /api/admin/awards/sync/[id]
 *
 * 画面が AWARD_SYNC_POLL_INTERVAL_MS 間隔でポーリングする。
 * admin ロール必須（`withAdminAuth` がDBで毎回確認する）。
 */

import { NextResponse } from 'next/server';

import { withAdminAuth } from '@/helpers/adminAuth';
import { isValidUuid, invalidUuidResponse } from '@/helpers/requestValidation';
import {
  notFoundResponse,
  rateLimitExceededResponse,
} from '@/helpers/apiHelpers';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import { findJobById, isJobStale } from '@/lib/awards/awardSyncJob';
import { AWARD_SYNC_MESSAGES } from '@/constants/awardSync';
import {
  HTTP_STATUS,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
  CACHE_CONTROL,
} from '@/constants';

export const GET = withAdminAuth(
  async ({ session, supabase, params }) => {
    // ポーリングで最も多く叩かれる。READ_USER_DATA に相乗りさせると
    // 1ジョブで300回使って他の認証必須読み取りを巻き込んで枯らすため専用カウンタ
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

    const { id } = await params!;

    if (!isValidUuid(id)) {
      return invalidUuidResponse(AWARD_SYNC_MESSAGES.NOT_FOUND);
    }

    const job = await findJobById(supabase, id);

    if (!job) {
      return notFoundResponse(AWARD_SYNC_MESSAGES.NOT_FOUND);
    }

    return NextResponse.json(
      { success: true, data: { job, isStale: isJobStale(job) } },
      {
        status: HTTP_STATUS.OK,
        headers: { 'Cache-Control': CACHE_CONTROL.PRIVATE_NO_STORE },
      },
    );
  },
  {
    errorLog: 'Award sync job fetch error',
    errorMessage: AWARD_SYNC_MESSAGES.FETCH_ERROR,
  },
);
