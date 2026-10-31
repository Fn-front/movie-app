/**
 * 受賞作品の手動同期フォームとポーリングを扱うカスタムフック
 *
 * ⚠️ ポーリングは4つを必ず満たすこと。1つでも欠けるとタブを開きっぱなしに
 * したときにリクエストが垂れ流しになり、ADMIN_AWARD_SYNC_STATUS の上限
 * （600回/30分）を食い潰す。
 *   1. 終端状態（succeeded / failed）で止める
 *   2. アンマウントで必ず止める
 *   3. 多重起動しない
 *   4. 連続失敗で打ち切る
 *
 * 設計: `.claude/documents/admin-award-sync-design.md`
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  extractConflict,
  extractMessage,
  fetchAwardSyncJob,
  fetchLatestAwardSync,
  startAwardSync,
  type AwardSyncJobView,
  type AwardSyncSnapshot,
} from '@/lib/api/awardSync/awardSync';
import {
  AWARD_SYNC_MAX_POLL_FAILURES,
  AWARD_SYNC_MESSAGES,
  AWARD_SYNC_POLL_INTERVAL_MS,
  AWARD_SYNC_STATUS,
  SYNCABLE_AWARD_OPTIONS,
} from '@/constants/awardSync';

export interface UseAwardSyncResult {
  awardName: string;
  year: string;
  job: AwardSyncJobView | null;
  isStale: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  /** 409 で返ってきた実行中ジョブ。強制失効の出し分けに使う */
  conflict: AwardSyncSnapshot | null;
  setAwardName: (value: string) => void;
  setYear: (value: string) => void;
  start: (options?: { force?: boolean }) => Promise<void>;
  dismissError: () => void;
}

function isTerminal(job: AwardSyncJobView | null): boolean {
  return job !== null && job.status !== AWARD_SYNC_STATUS.RUNNING;
}

export function useAwardSync(): UseAwardSyncResult {
  // Select の onValueChange が (value: string) => void なので string で持つ。
  // 賞キーの妥当性はサーバー側の zod（awardSyncCreateSchema）が最終判定する
  const [awardName, setAwardName] = useState<string>(
    SYNCABLE_AWARD_OPTIONS[0].value,
  );
  const [year, setYear] = useState('');
  const [job, setJob] = useState<AwardSyncJobView | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<AwardSyncSnapshot | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failureCountRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (timerRef.current === null) return;

    clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const applySnapshot = useCallback(
    (snapshot: AwardSyncSnapshot) => {
      setJob(snapshot.job);
      setIsStale(snapshot.isStale);

      if (isTerminal(snapshot.job)) stopPolling();
    },
    [stopPolling],
  );

  const startPolling = useCallback(
    (jobId: string) => {
      // 多重起動を防ぐ。start を連打しても interval は1本に保つ
      stopPolling();
      failureCountRef.current = 0;

      timerRef.current = setInterval(() => {
        void (async () => {
          try {
            const snapshot = await fetchAwardSyncJob(jobId);
            failureCountRef.current = 0;
            applySnapshot(snapshot);
          } catch (cause) {
            failureCountRef.current += 1;

            // 一時的な失敗で止めると進捗を見失うが、延々と叩き続けると
            // レート制限を食い潰す。数回で打ち切って理由を出す
            if (failureCountRef.current >= AWARD_SYNC_MAX_POLL_FAILURES) {
              stopPolling();
              setError(extractMessage(cause, AWARD_SYNC_MESSAGES.FETCH_ERROR));
            }
          }
        })();
      }, AWARD_SYNC_POLL_INTERVAL_MS);
    },
    [applySnapshot, stopPolling],
  );

  // リロード後も進捗を追えるよう、マウント時に最新ジョブを復元する
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const snapshot = await fetchLatestAwardSync();
        if (cancelled) return;

        setJob(snapshot.job);
        setIsStale(snapshot.isStale);

        if (snapshot.job?.status === AWARD_SYNC_STATUS.RUNNING) {
          startPolling(snapshot.job.id);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(extractMessage(cause, AWARD_SYNC_MESSAGES.FETCH_ERROR));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [startPolling]);

  // アンマウント時に必ず止める
  useEffect(() => stopPolling, [stopPolling]);

  const start = useCallback(
    async (options?: { force?: boolean }) => {
      setIsSubmitting(true);
      setError(null);
      setConflict(null);

      try {
        const created = await startAwardSync({
          awardName,
          year: Number(year),
          force: options?.force ?? false,
        });

        setJob(created);
        setIsStale(false);
        startPolling(created.id);
      } catch (cause) {
        // 409 は実行中ジョブの情報を持つ。単なるエラー文言として潰すと
        // 強制失効へ進む判断が画面からできなくなる
        const conflictSnapshot = extractConflict(cause);

        if (conflictSnapshot) {
          setConflict(conflictSnapshot);
        } else {
          setError(extractMessage(cause, AWARD_SYNC_MESSAGES.START_ERROR));
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [awardName, year, startPolling],
  );

  const dismissError = useCallback(() => {
    setError(null);
    setConflict(null);
  }, []);

  return {
    awardName,
    year,
    job,
    isStale,
    isLoading,
    isSubmitting,
    error,
    conflict,
    setAwardName,
    setYear,
    start,
    dismissError,
  };
}
