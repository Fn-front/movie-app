/**
 * 受賞作品の手動同期ジョブの読み書き
 *
 * ⚠️ after() 側からの書き込みは必ず `status = 'running'` を条件にすること。
 * 強制失効はジョブ行を failed にするだけで走行中の処理を止められず、その瞬間に
 * 部分ユニークインデックス `uq_award_sync_jobs_active` の述語からも外れて保護が
 * 消える。条件を付けないと失効済みのジョブが succeeded に化け、さらに新しい
 * ジョブと同じ賞・年へ並走して書き込んでしまう。
 *
 * 設計: `.claude/documents/admin-award-sync-design.md`
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  AWARD_SYNC_STALE_MINUTES,
  AWARD_SYNC_STATUS,
  type AwardSyncStatus,
  type SyncableAwardName,
} from '@/constants/awardSync';
import { MS_PER_MINUTE } from '@/constants/time';

const TABLE = 'award_sync_jobs';

/** Postgres の UNIQUE 制約違反 */
const UNIQUE_VIOLATION_CODE = '23505';

/** 画面・APIに返すジョブ */
export interface AwardSyncJob {
  id: string;
  awardName: string;
  awardYear: number;
  status: AwardSyncStatus;
  totalUpserted: number | null;
  errorMessage: string | null;
  /** 成功時の警告。旧世代の削除に失敗して残留が残った場合など */
  warningMessage: string | null;
  createdAt: string;
  startedAt: string;
  finishedAt: string | null;
}

/** DB の行 */
interface AwardSyncJobRow {
  id: string;
  award_name: string;
  award_year: number;
  status: AwardSyncStatus;
  total_upserted: number | null;
  error_message: string | null;
  warning_message: string | null;
  created_at: string;
  started_at: string;
  finished_at: string | null;
}

const SELECT_COLUMNS =
  'id, award_name, award_year, status, total_upserted, error_message, warning_message, created_at, started_at, finished_at';

function toJob(row: AwardSyncJobRow): AwardSyncJob {
  return {
    id: row.id,
    awardName: row.award_name,
    awardYear: row.award_year,
    status: row.status,
    totalUpserted: row.total_upserted,
    errorMessage: row.error_message,
    warningMessage: row.warning_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

/**
 * 実行中ジョブが「停止した可能性あり」かを判定する
 *
 * 自動で failed に倒すためではなく、画面に強制失効の操作を出すかどうかを
 * 決めるために使う。走っている最中の処理を誤って切らせないため、閾値未満では
 * 操作を出さない。
 */
export function isJobStale(job: AwardSyncJob, now: Date = new Date()): boolean {
  if (job.status !== AWARD_SYNC_STATUS.RUNNING) return false;

  const elapsed = now.getTime() - Date.parse(job.startedAt);

  return elapsed >= AWARD_SYNC_STALE_MINUTES * MS_PER_MINUTE;
}

/**
 * 実行中ジョブを起票する
 *
 * 部分ユニークインデックス `uq_award_sync_jobs_active` により、アクティブな
 * ジョブが既にあると 23505 で弾かれる。呼び出し元の事前チェックと INSERT の
 * 間に別リクエストが入る競合をここで吸収する（500 にしない）。
 */
export async function createRunningJob(
  supabase: SupabaseClient,
  params: { awardName: SyncableAwardName; year: number; requestedBy: string },
): Promise<{ job: AwardSyncJob } | { conflict: true }> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      award_name: params.awardName,
      award_year: params.year,
      status: AWARD_SYNC_STATUS.RUNNING,
      requested_by: params.requestedBy,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION_CODE) return { conflict: true };
    throw error;
  }

  return { job: toJob(data as AwardSyncJobRow) };
}

/** 実行中のジョブを取得する（アクティブは全体で1件までなので最大1件） */
export async function findRunningJob(
  supabase: SupabaseClient,
): Promise<AwardSyncJob | null> {
  const { data } = await supabase
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .eq('status', AWARD_SYNC_STATUS.RUNNING)
    .maybeSingle();

  return data ? toJob(data as AwardSyncJobRow) : null;
}

/** IDでジョブを取得する */
export async function findJobById(
  supabase: SupabaseClient,
  id: string,
): Promise<AwardSyncJob | null> {
  const { data } = await supabase
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  return data ? toJob(data as AwardSyncJobRow) : null;
}

/** 最新のジョブを取得する（リロード後の復元用） */
export async function findLatestJob(
  supabase: SupabaseClient,
): Promise<AwardSyncJob | null> {
  const { data } = await supabase
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? toJob(data as AwardSyncJobRow) : null;
}

/**
 * 実行中ジョブを終端状態にする
 *
 * @returns 更新できたら true。**false は「強制失効させられていた」を意味する**
 */
export async function finishJobIfRunning(
  supabase: SupabaseClient,
  id: string,
  patch: {
    status:
      | typeof AWARD_SYNC_STATUS.SUCCEEDED
      | typeof AWARD_SYNC_STATUS.FAILED;
    totalUpserted?: number;
    errorMessage?: string;
    /** 成功扱いのまま残したい警告。status は変えない */
    warningMessage?: string;
  },
): Promise<boolean> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      status: patch.status,
      total_upserted: patch.totalUpserted ?? null,
      error_message: patch.errorMessage ?? null,
      warning_message: patch.warningMessage ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', AWARD_SYNC_STATUS.RUNNING)
    .select('id');

  if (error) {
    console.error(
      `[awardSyncJob] 終端状態への更新に失敗しました id=${id}`,
      error,
    );
    return false;
  }

  return (data?.length ?? 0) > 0;
}

/**
 * ジョブがまだ running かを確認する
 *
 * 書き込みフェーズに入る直前に呼び、強制失効されていたら中止する。
 */
export async function isJobStillRunning(
  supabase: SupabaseClient,
  id: string,
): Promise<boolean> {
  const { data } = await supabase
    .from(TABLE)
    .select('id')
    .eq('id', id)
    .eq('status', AWARD_SYNC_STATUS.RUNNING)
    .maybeSingle();

  return !!data;
}
