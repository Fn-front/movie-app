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
 * 間隔は `AWARD_SYNC_POLL_SCHEDULE` で経過に応じて伸びる（#1282）。
 * 一定でないため setInterval ではなく setTimeout を繋ぐ。
 *
 * 設計: `.claude/documents/admin-award-sync-design.md`
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useDebounce } from '@/hooks/useDebounce';
import {
  extractConflict,
  extractMessage,
  fetchAwardSyncJob,
  fetchExistingAwardCount,
  fetchLatestAwardSync,
  startAwardSync,
  type AwardSyncJobView,
  type AwardSyncSnapshot,
} from '@/lib/api/awardSync/awardSync';
import {
  AWARD_SYNC_COUNT_DEBOUNCE_MS,
  AWARD_SYNC_MAX_POLL_FAILURES,
  AWARD_SYNC_MESSAGES,
  AWARD_SYNC_STATUS,
  getAwardSyncPollIntervalMs,
  isSyncableYear,
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
  /**
   * 指定中の賞・年に既に入っている件数。
   * 未取得・範囲外・取得失敗は null（警告を出さない）
   */
  existingCount: number | null;
  setAwardName: (value: string) => void;
  setYear: (value: string) => void;
  start: (options?: { force?: boolean }) => Promise<void>;
  dismissError: () => void;
}

function isTerminal(job: AwardSyncJobView | null): boolean {
  return job !== null && job.status !== AWARD_SYNC_STATUS.RUNNING;
}

/**
 * ジョブの開始からの経過時間（ミリ秒）
 *
 * リロードでポーリング間隔が最初の段へ戻らないようにするために使う。
 * `startedAt` が読めない・未来の値だったときは 0 に倒す（間隔が短い側＝
 * 安全側で、レート制限の見積もりも超えない）。
 */
function elapsedSinceStart(job: AwardSyncJobView): number {
  const startedAt = Date.parse(job.startedAt);

  if (Number.isNaN(startedAt)) return 0;

  return Math.max(0, Date.now() - startedAt);
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
  const [existingCount, setExistingCount] = useState<number | null>(null);
  /** 同期完了のたびに件数を取り直すためのトリガー */
  const [countRevision, setCountRevision] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failureCountRef = useRef(0);
  /**
   * ポーリングの世代。
   *
   * 間隔が一定でないので setInterval ではなく setTimeout を繋いでいる。
   * 次の1回は「応答が返ってから」積むため、停止した後に解決した fetch が
   * タイマーを積み直しうる。世代を進めて、その継続を無効にする。
   */
  const pollGenerationRef = useRef(0);

  const stopPolling = useCallback(() => {
    pollGenerationRef.current += 1;

    if (timerRef.current === null) return;

    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const applySnapshot = useCallback(
    (snapshot: AwardSyncSnapshot) => {
      setJob(snapshot.job);
      setIsStale(snapshot.isStale);

      if (!isTerminal(snapshot.job)) return;

      stopPolling();
      // 入れ替わった後の件数を見せる必要がある
      setCountRevision((n) => n + 1);
    },
    [stopPolling],
  );

  const startPolling = useCallback(
    (jobId: string, alreadyElapsedMs = 0) => {
      // 多重起動を防ぐ。start を連打してもタイマーは1本に保つ
      stopPolling();
      failureCountRef.current = 0;

      const generation = pollGenerationRef.current;
      // 経過時間は積んだ間隔の合計で持つ。実時計を見ないので
      // タブが止まっていた間に間隔を飛ばすことがない。
      //
      // ⚠️ ただしリロードはここが 0 に戻る。18分走っているジョブの画面を
      // 開き直すたびに5秒間隔が1分ぶん復活してしまうので、復元経路は
      // ジョブの開始時刻から経過を渡す（#1282）
      let elapsedMs = alreadyElapsedMs;

      const scheduleNext = () => {
        const intervalMs = getAwardSyncPollIntervalMs(elapsedMs);
        elapsedMs += intervalMs;

        timerRef.current = setTimeout(() => {
          timerRef.current = null;

          void (async () => {
            try {
              const snapshot = await fetchAwardSyncJob(jobId);

              if (pollGenerationRef.current !== generation) return;

              failureCountRef.current = 0;
              applySnapshot(snapshot);
            } catch (cause) {
              if (pollGenerationRef.current !== generation) return;

              failureCountRef.current += 1;

              // 一時的な失敗で止めると進捗を見失うが、延々と叩き続けると
              // レート制限を食い潰す。数回で打ち切って理由を出す
              if (failureCountRef.current >= AWARD_SYNC_MAX_POLL_FAILURES) {
                stopPolling();
                setError(
                  extractMessage(cause, AWARD_SYNC_MESSAGES.FETCH_ERROR),
                );
                return;
              }
            }

            // 終端到達・アンマウント・打ち切りは stopPolling が世代を進める
            if (pollGenerationRef.current !== generation) return;

            scheduleNext();
          })();
        }, intervalMs);
      };

      scheduleNext();
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
          startPolling(snapshot.job.id, elapsedSinceStart(snapshot.job));
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

  // 既に入っている件数を知らせる。実行を弾くためではないので、
  // 取得に失敗しても error にはせず黙って警告を出さないだけにする
  const debouncedYear = useDebounce(year, AWARD_SYNC_COUNT_DEBOUNCE_MS);

  useEffect(() => {
    const parsedYear = Number(debouncedYear);

    if (!debouncedYear || !isSyncableYear(awardName, parsedYear)) {
      setExistingCount(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const count = await fetchExistingAwardCount({
          awardName,
          year: parsedYear,
        });
        if (!cancelled) setExistingCount(count);
      } catch {
        // 件数は補助情報。取れなければ警告を出さないだけで実行は妨げない
        if (!cancelled) setExistingCount(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [awardName, debouncedYear, countRevision]);

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
    existingCount,
    setAwardName,
    setYear,
    start,
    dismissError,
  };
}
