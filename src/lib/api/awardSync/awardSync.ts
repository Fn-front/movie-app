/**
 * 受賞作品の手動同期 API クライアント
 */

import { isAxiosError } from 'axios';

import { API_ENDPOINTS, HTTP_STATUS } from '@/constants';
import { axiosInstance } from '@/lib/axios/axios';

/** 画面で扱うジョブ */
export interface AwardSyncJobView {
  id: string;
  awardName: string;
  awardYear: number;
  status: 'running' | 'succeeded' | 'failed';
  totalUpserted: number | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string;
  finishedAt: string | null;
}

/** ジョブと「停止した可能性あり」判定 */
export interface AwardSyncSnapshot {
  job: AwardSyncJobView | null;
  isStale: boolean;
}

interface SnapshotResponse {
  success: true;
  data: AwardSyncSnapshot;
}

interface StartResponse {
  success: true;
  data: { job: AwardSyncJobView };
}

/** 同期を開始する */
export async function startAwardSync(input: {
  awardName: string;
  year: number;
  force?: boolean;
}): Promise<AwardSyncJobView> {
  const { data } = await axiosInstance.post<StartResponse>(
    API_ENDPOINTS.ADMIN_AWARD_SYNC,
    input,
  );
  return data.data.job;
}

/** 指定ジョブの進捗を取得する */
export async function fetchAwardSyncJob(
  id: string,
): Promise<AwardSyncSnapshot> {
  const { data } = await axiosInstance.get<SnapshotResponse>(
    API_ENDPOINTS.ADMIN_AWARD_SYNC_JOB(id),
  );
  return data.data;
}

/** 最新のジョブを取得する（リロード後の復元用） */
export async function fetchLatestAwardSync(): Promise<AwardSyncSnapshot> {
  const { data } = await axiosInstance.get<SnapshotResponse>(
    API_ENDPOINTS.ADMIN_AWARD_SYNC,
  );
  return data.data;
}

/**
 * 409 のボディから実行中ジョブを取り出す
 *
 * 強制失効の操作を出してよいかは `isStale` でしか判断できない。409 を単なる
 * エラー文言として扱うと、ジョブが詰まったときに解く手段が画面から消える。
 */
export function extractConflict(cause: unknown): AwardSyncSnapshot | null {
  if (!isAxiosError(cause)) return null;
  if (cause.response?.status !== HTTP_STATUS.CONFLICT) return null;

  const body = cause.response.data as
    | { data?: { job?: AwardSyncJobView | null; isStale?: boolean } }
    | undefined;

  if (!body?.data) return null;

  return {
    job: body.data.job ?? null,
    isStale: body.data.isStale ?? false,
  };
}

/**
 * サーバーが返したメッセージを優先して取り出す
 *
 * レート制限や取得0件の理由など、原因が分かるメッセージをそのまま見せたい。
 * `formatErrorMessage` は `Response` を参照するため jsdom 環境のテストで
 * 落ちるので、既存の `useAdminAccounts` と同じ方針でここに持つ。
 */
export function extractMessage(cause: unknown, fallback: string): string {
  if (isAxiosError(cause)) {
    const data = cause.response?.data as
      | { error?: { message?: unknown } }
      | undefined;
    const message = data?.error?.message;

    if (typeof message === 'string' && message) return message;
  }

  return fallback;
}
