/**
 * 受賞作品の手動同期ページ（admin ロールのみ）
 *
 * 同期は分単位かかることがあるため、実行後は進捗をポーリングして表示する。
 * 設計: `.claude/documents/admin-award-sync-design.md`
 */

'use client';

import { memo, useCallback } from 'react';

import { Heading } from '@/components/ui/heading/heading';
import { Button } from '@/components/ui/button/button';
import { Input } from '@/components/ui/input/input';
import { Select } from '@/components/ui/select/select';
import { Skeleton } from '@/components/ui/skeleton/skeleton';
import { EmptyState } from '@/components/ui/emptyState/emptyState';
import { cn } from '@/utils/cn';
import { ROUTES } from '@/constants';
import {
  AWARD_SYNC_MESSAGES,
  AWARD_SYNC_STATUS,
  SYNCABLE_AWARD_OPTIONS,
} from '@/constants/awardSync';
import type { AwardSyncJobView } from '@/lib/api/awardSync/awardSync';

import { useAwardSync } from './hooks/useAwardSync';

import styles from './awardsSyncPage.module.scss';

/** 同期の実行フォーム */
const SyncForm = memo(function SyncForm({
  awardName,
  year,
  isSubmitting,
  onAwardNameChange,
  onYearChange,
  onSubmit,
}: {
  awardName: string;
  year: string;
  isSubmitting: boolean;
  onAwardNameChange: (value: string) => void;
  onYearChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      onSubmit();
    },
    [onSubmit],
  );

  const handleYearChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onYearChange(event.target.value);
    },
    [onYearChange],
  );

  return (
    <form className={styles.c_awards_sync__form} onSubmit={handleSubmit}>
      <Select
        label='賞'
        options={SYNCABLE_AWARD_OPTIONS}
        value={awardName}
        onValueChange={onAwardNameChange}
        fullWidth
      />
      <Input
        label='年（授賞式の年）'
        type='number'
        value={year}
        onChange={handleYearChange}
        placeholder='2024'
        fullWidth
        required
      />
      {/*
        日本語は JSX の改行が半角スペースになって語中で割れるため、
        文字列として渡して折り返しをブラウザに任せる
      */}
      <p className={styles.c_awards_sync__hint}>
        {
          '指定した賞・年のデータを取り直します。取得できなかった場合、既存のデータは変更されません。'
        }
      </p>
      <Button type='submit' disabled={isSubmitting || !year}>
        {isSubmitting ? '開始中...' : '同期を開始'}
      </Button>
    </form>
  );
});

/** ジョブの状態表示 */
const JobStatus = memo(function JobStatus({ job }: { job: AwardSyncJobView }) {
  const isRunning = job.status === AWARD_SYNC_STATUS.RUNNING;

  const className = cn(
    styles.c_awards_sync__status,
    isRunning && styles.c_awards_sync__status__running,
    isRunning && styles.c_awards_sync__pulse,
    job.status === AWARD_SYNC_STATUS.SUCCEEDED &&
      styles.c_awards_sync__status__succeeded,
    job.status === AWARD_SYNC_STATUS.FAILED &&
      styles.c_awards_sync__status__failed,
  );

  return (
    <div className={className} role='status' aria-live='polite'>
      {isRunning && <p>実行中です。完了まで数分かかることがあります。</p>}

      {job.status === AWARD_SYNC_STATUS.SUCCEEDED && (
        <>
          <p>完了しました（{job.totalUpserted ?? 0}件）。</p>
          {/*
            /api/awards は public キャッシュを返すため、同期直後でも
            ブラウザが古い結果を見せうる。クエリを変えて取り直させないと、
            管理者が「直っていない」と誤判断して再実行してしまう
          */}
          <a
            href={`${ROUTES.AWARDS}?t=${encodeURIComponent(job.finishedAt ?? '')}`}
          >
            受賞作品ページで確認
          </a>
        </>
      )}

      {job.status === AWARD_SYNC_STATUS.FAILED && (
        <p>{job.errorMessage ?? AWARD_SYNC_MESSAGES.START_ERROR}</p>
      )}

      <p className={styles.c_awards_sync__meta}>
        {job.awardName} / {job.awardYear}年
      </p>
    </div>
  );
});

/** 実行中ジョブがあるときの案内 */
const ConflictNotice = memo(function ConflictNotice({
  isStale,
  isSubmitting,
  onForce,
}: {
  isStale: boolean;
  isSubmitting: boolean;
  onForce: () => void;
}) {
  return (
    <div className={styles.c_awards_sync__conflict}>
      <p>{AWARD_SYNC_MESSAGES.ALREADY_RUNNING}</p>

      {/*
        閾値未満では強制操作を出さない。正常に走っている処理を
        誤って切らせないため
      */}
      {isStale && (
        <>
          <p className={styles.c_awards_sync__hint}>
            {AWARD_SYNC_MESSAGES.STALE_HINT}
          </p>
          <Button type='button' onClick={onForce} disabled={isSubmitting}>
            強制的に失敗として閉じて再実行
          </Button>
        </>
      )}
    </div>
  );
});

/** 受賞作品の手動同期ページ */
export const AwardsSyncPage = memo(function AwardsSyncPage() {
  const {
    awardName,
    year,
    job,
    isLoading,
    isSubmitting,
    error,
    conflict,
    setAwardName,
    setYear,
    start,
  } = useAwardSync();

  const handleSubmit = useCallback(() => {
    void start();
  }, [start]);

  const handleForce = useCallback(() => {
    void start({ force: true });
  }, [start]);

  return (
    <div className={styles.c_awards_sync}>
      <Heading level={1}>{AWARD_SYNC_MESSAGES.PAGE_TITLE}</Heading>

      <SyncForm
        awardName={awardName}
        year={year}
        isSubmitting={isSubmitting}
        onAwardNameChange={setAwardName}
        onYearChange={setYear}
        onSubmit={handleSubmit}
      />

      {error && <p className={styles.c_awards_sync__error}>{error}</p>}

      {conflict && (
        <ConflictNotice
          isStale={conflict.isStale}
          isSubmitting={isSubmitting}
          onForce={handleForce}
        />
      )}

      <section className={styles.c_awards_sync__section}>
        <Heading level={2}>直近の実行</Heading>

        {isLoading ? (
          <Skeleton
            variant='rect'
            width='100%'
            height={120}
            data-testid='award-sync-loading'
          />
        ) : job ? (
          <JobStatus job={job} />
        ) : (
          <EmptyState title='実行履歴はまだありません' headingLevel={3} />
        )}
      </section>
    </div>
  );
});
