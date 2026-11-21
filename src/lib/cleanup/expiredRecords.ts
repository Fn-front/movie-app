/**
 * 保持期間切れレコードの掃除（#933 / #978 / #1300）
 *
 * 個人情報保護法22条（不要となった個人データの消去の努力義務）に関わる処理を
 * 1か所に集める。日次CRON（`/api/cron/cleanup-expired-records`）から呼ぶ。
 *
 * ⚠️ **専用CRONにしている理由（#933）。** 無関係な処理の失敗でスキップされない
 * ようにするため。
 *
 * `recommendation_events` は長らくレコメンド生成CRONに相乗りしていたが、
 * #1355 でここへ移した。あちらは冒頭の `fetchActiveUserIds` が失敗すると
 * 早期 return で到達しないうえ、**失敗を catch して 0 を返す**ので
 * 消えていないことに気づけなかった。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { SOFT_DELETED_LIST_RETENTION_HOURS } from '@/constants/cleanup';
import { OTP_CODE_RETENTION_HOURS } from '@/constants/otp';
import { PASSWORD_RESET_TOKEN_RETENTION_HOURS } from '@/constants/passwordReset';
import { RATE_LIMIT_RETENTION_HOURS } from '@/constants/rateLimit';
import { RECOMMENDATION_EVENT_RETENTION_HOURS } from '@/constants/recommendations';

import { BatchedDeleteError, runBatchedDelete } from './batchedDelete';

/**
 * Vercel Function の `maxDuration`（60秒）に対する時間予算
 *
 * 打ち切り判定は**バッチの境目**でしか効かないので、判定の直後に始まった
 * RPC が `statement_timeout`（8秒）いっぱい掛かる分の余裕が要る。
 *
 * ⚠️ **この予算は全対象で共有する。** 対象ごとに 35秒 を持たせると
 * 7対象で 245秒 になり、`maxDuration` を超えて強制終了される
 * （削除件数のログすら残らない）。
 *
 * この関係は `expiredRecords.test.ts` の不変条件テストで固定している。
 */
export const TIME_BUDGET_MS = 35_000;

/** 掃除の対象 */
export interface CleanupTarget {
  /** レスポンスとログに出す名前 */
  name: string;
  /** 呼ぶ RPC 名 */
  rpc: string;
  /** 保持期間（時間） */
  retentionHours: number;
}

/**
 * 掃除の対象一覧
 *
 * ⚠️ 新しく個人データを持つテーブルを足したら、**ここにも足す**。
 * 足し忘れても何も壊れないので気づけない（#978 は実際に
 * 「ドキュメントには定期削除と書いてあるがジョブは存在しない」状態が続いた）。
 */
export const CLEANUP_TARGETS: readonly CleanupTarget[] = [
  {
    name: 'rate_limits',
    rpc: 'delete_expired_rate_limits',
    retentionHours: RATE_LIMIT_RETENTION_HOURS,
  },
  {
    name: 'otp_codes',
    rpc: 'delete_expired_otp_codes',
    retentionHours: OTP_CODE_RETENTION_HOURS,
  },
  {
    name: 'password_reset_tokens',
    rpc: 'delete_expired_password_reset_tokens',
    retentionHours: PASSWORD_RESET_TOKEN_RETENTION_HOURS,
  },
  {
    name: 'recommendation_events',
    rpc: 'delete_expired_recommendation_events',
    retentionHours: RECOMMENDATION_EVENT_RETENTION_HOURS,
  },
  // 以下3つは論理削除された利用者リスト（#433）。
  //
  // `deleted_at` が入っても行は残り、TMDb 由来の表示列を保持し続けていた。
  // 利用者と結びついているので上の4つと同じ「不要となった個人データ」でもある。
  //
  // ⚠️ **末尾に足している。** 時間予算（`TIME_BUDGET_MS`）は全対象で共有する
  //   ので、先頭の対象が滞留すると後ろは0件で終わる。先頭へ入れると今度は
  //   `rate_limits`（最も行が増える／個人情報保護法22条の本丸）が飢えるため、
  //   順番を入れ替えるのではなく**打ち切りを通知する**ことで塞いだ
  //   （`cleanup-expired-records/route.ts` の `truncated`）。
  //   この3つは対象行数が少なく（本番実測で合計21行）、滞留しにくい。
  {
    name: 'favorites',
    rpc: 'delete_expired_favorites',
    retentionHours: SOFT_DELETED_LIST_RETENTION_HOURS,
  },
  {
    name: 'watchlist',
    rpc: 'delete_expired_watchlist',
    retentionHours: SOFT_DELETED_LIST_RETENTION_HOURS,
  },
  {
    name: 'dismissed_movies',
    rpc: 'delete_expired_dismissed_movies',
    retentionHours: SOFT_DELETED_LIST_RETENTION_HOURS,
  },
] as const;

/** 対象1つぶんの結果 */
export interface CleanupTargetResult {
  name: string;
  retention_hours: number;
  deleted_count: number;
  /** 消し切ったか。失敗したときも false */
  completed: boolean;
  /** 失敗した場合の理由。成功時は含めない */
  error?: string;
}

/** 掃除全体の結果 */
export interface CleanupExpiredRecordsResult {
  targets: CleanupTargetResult[];
  /** 全対象を消し切ったか（1つでも失敗・打ち切りがあれば false） */
  completed: boolean;
  /** 1つでも失敗したか。呼び出し側はこれを見てステータスを決める */
  hasError: boolean;
}

/**
 * 保持期間を過ぎたレコードを対象ごとに削除する
 *
 * ⚠️ **1つが失敗しても残りを実行する。** 専用CRONにした目的が
 * 「無関係な処理の失敗でスキップされないこと」なので、対象を増やした結果
 * 1つの失敗で他が止まるなら本末転倒。失敗は `targets[].error` に載せ、
 * 呼び出し側が全体のステータスを決める。
 *
 * @param supabase - service role クライアント
 * @returns 対象ごとの結果と、全体の完走・失敗フラグ
 */
export async function cleanupExpiredRecords(
  supabase: SupabaseClient,
): Promise<CleanupExpiredRecordsResult> {
  const deadlineAt = Date.now() + TIME_BUDGET_MS;
  const targets: CleanupTargetResult[] = [];

  for (const target of CLEANUP_TARGETS) {
    try {
      const { deleted, completed } = await runBatchedDelete(supabase, {
        rpc: target.rpc,
        retentionHours: target.retentionHours,
        label: target.name,
        deadlineAt,
      });

      targets.push({
        name: target.name,
        retention_hours: target.retentionHours,
        deleted_count: deleted,
        completed,
      });
    } catch (error) {
      // ⚠️ ここで throw し直さない。残りの対象を消す機会を奪う
      console.error(
        `[cleanupExpiredRecords] ${target.name} の削除に失敗`,
        error,
      );

      targets.push({
        name: target.name,
        retention_hours: target.retentionHours,
        // ⚠️ 0 で握り直さない。失敗までに確定した削除は**確定している**ので、
        //   件数を合計する監視が過少申告しないよう構造化データにも残す
        deleted_count: error instanceof BatchedDeleteError ? error.deleted : 0,
        completed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    targets,
    completed: targets.every((t) => t.completed),
    hasError: targets.some((t) => t.error !== undefined),
  };
}
