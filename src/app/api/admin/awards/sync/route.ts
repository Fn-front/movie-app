/**
 * 受賞作品の手動同期 API
 * POST /api/admin/awards/sync - 同期ジョブを起票して非同期に実行する
 * GET  /api/admin/awards/sync - 最新のジョブを取得する（リロード後の復元用）
 *
 * admin ロール必須（`withAdminAuth` がDBで毎回確認する）。
 * 設計: `.claude/documents/admin-award-sync-design.md`
 */

import { NextResponse, after } from 'next/server';

import { withAdminAuth } from '@/helpers/adminAuth';
import { parseAndValidate } from '@/helpers/requestValidation';
import { rateLimitExceededResponse } from '@/helpers/apiHelpers';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';
import {
  createRunningJob,
  findLatestJob,
  findRunningJob,
  finishJobIfRunning,
  isJobStale,
  type AwardSyncJob,
} from '@/lib/awards/awardSyncJob';
import { executeManualAwardSync } from '@/lib/awards/manualAwardSync';
import { awardSyncCreateSchema } from '@/schema/awardSync';
import { AWARD_SYNC_MESSAGES, AWARD_SYNC_STATUS } from '@/constants/awardSync';
import {
  HTTP_STATUS,
  ERROR_CODE,
  RATE_LIMIT_ACTION,
  RATE_LIMIT_CONFIG,
  CACHE_CONTROL,
} from '@/constants';

/** 管理情報をCDNや共有キャッシュに残さない */
const NO_STORE = { 'Cache-Control': CACHE_CONTROL.PRIVATE_NO_STORE };

/**
 * 実行中ジョブがあることを伝える 409
 *
 * ジョブ情報を同梱する。これが無いと、画面はリロード後に「何が走っているか」も
 * 「強制失効の操作を出してよいか」も判定できず、詰まったときに解く手段が
 * 画面から消える。
 */
function alreadyRunningResponse(job: AwardSyncJob | null) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: ERROR_CODE.CONFLICT,
        message: AWARD_SYNC_MESSAGES.ALREADY_RUNNING,
      },
      data: { job, isStale: job ? isJobStale(job) : false },
    },
    { status: HTTP_STATUS.CONFLICT, headers: NO_STORE },
  );
}

export const POST = withAdminAuth(
  async ({ session, supabase, request }) => {
    // カンヌ・ゴールデングローブは OpenAI を部門数ぶん呼ぶため課金が発生する。
    // admin セッションを奪われた場合の被害を上限で抑える（#641 と同じ理屈）
    const limitResult = await checkRateLimit(
      supabase,
      session.user.id,
      RATE_LIMIT_ACTION.ADMIN_AWARD_SYNC,
      RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC.maxAttempts,
      RATE_LIMIT_CONFIG.ADMIN_AWARD_SYNC.windowMinutes,
    );

    if (!limitResult.allowed) {
      return rateLimitExceededResponse(limitResult);
    }

    const { data: body, error: validationError } = await parseAndValidate(
      request,
      awardSyncCreateSchema,
      AWARD_SYNC_MESSAGES.INVALID_BODY,
    );

    if (validationError) return validationError;

    const running = await findRunningJob(supabase);

    if (running) {
      // 閾値未満のジョブは force でも触らせない。正常に走っている処理を
      // 誤って切らせないため
      if (!body.force || !isJobStale(running)) {
        return alreadyRunningResponse(running);
      }

      // ⚠️ これは走行中の after() を止めない。旧プロセスは
      //    isJobStillRunning の確認で自分が失効したことを検知して中止する
      const expired = await finishJobIfRunning(supabase, running.id, {
        status: AWARD_SYNC_STATUS.FAILED,
        errorMessage: AWARD_SYNC_MESSAGES.SUPERSEDED,
      });

      // 別のリクエストが先に閉じていた場合は競合として扱う
      if (!expired) {
        return alreadyRunningResponse(await findRunningJob(supabase));
      }
    }

    const created = await createRunningJob(supabase, {
      awardName: body.awardName,
      year: body.year,
      requestedBy: session.user.id,
    });

    // 事前チェックと INSERT の間に別リクエストが入った場合。
    // 23505 をそのまま投げると 500 になるため 409 に落とす
    if ('conflict' in created) {
      return alreadyRunningResponse(await findRunningJob(supabase));
    }

    const { job } = created;

    // レスポンスを返した後に継続実行する。
    // executeManualAwardSync は例外を外へ投げない（Next は after() の例外を
    // 握り潰すため、投げるとジョブが running のまま孤児になる）
    after(async () => {
      await executeManualAwardSync(supabase, {
        jobId: job.id,
        awardName: body.awardName,
        year: body.year,
      });
    });

    return NextResponse.json(
      { success: true, data: { job } },
      { status: HTTP_STATUS.ACCEPTED, headers: NO_STORE },
    );
  },
  {
    errorLog: 'Award sync start error',
    errorMessage: AWARD_SYNC_MESSAGES.START_ERROR,
  },
);

export const GET = withAdminAuth(
  async ({ session, supabase }) => {
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

    const job = await findLatestJob(supabase);

    return NextResponse.json(
      { success: true, data: { job, isStale: job ? isJobStale(job) : false } },
      { status: HTTP_STATUS.OK, headers: NO_STORE },
    );
  },
  {
    errorLog: 'Award sync latest fetch error',
    errorMessage: AWARD_SYNC_MESSAGES.FETCH_ERROR,
  },
);
