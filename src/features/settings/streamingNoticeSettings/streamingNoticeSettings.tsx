/**
 * 配信開始のお知らせ設定コンポーネント
 */

'use client';

import { memo, useCallback, useEffect, useState } from 'react';

import { RadioGroup } from '@/components/ui/radioGroup/radioGroup';
import { Skeleton } from '@/components/ui/skeleton/skeleton';
import {
  STREAMING_SCOPE_DEFAULT,
  WATCHLIST_STREAMING_SCOPE_LABELS,
} from '@/constants';
import type { StreamingScope } from '@/constants';
import { useToast } from '@/hooks/useToast';
import { getSettings, updateSettings } from '@/lib/api/user/user';
import { handleApiError } from '@/utils/error';

import styles from './streamingNoticeSettings.module.scss';

/** ラジオの選択肢（ファイルスコープ定数） */
const SCOPE_OPTIONS = [
  { label: WATCHLIST_STREAMING_SCOPE_LABELS.ANY, value: 'any' },
  { label: WATCHLIST_STREAMING_SCOPE_LABELS.FLATRATE, value: 'flatrate' },
];

/**
 * 配信開始のお知らせ設定
 *
 * 既存の通知設定と同じく、設定APIを直接叩いて即座に保存する。
 * 失敗したら選択を元に戻す。
 */
export const StreamingNoticeSettings = memo(function StreamingNoticeSettings() {
  const { toast } = useToast();
  const [scope, setScope] = useState<StreamingScope>(STREAMING_SCOPE_DEFAULT);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchSettings = async () => {
      try {
        const settings = await getSettings();
        if (!cancelled) {
          setScope(settings.streamingNoticeScope);
        }
      } catch {
        // 既定値のまま表示する
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = useCallback(
    async (value: string) => {
      const next = value as StreamingScope;
      const previous = scope;
      setScope(next);

      try {
        await updateSettings({ streamingNoticeScope: next });
        toast({
          title: WATCHLIST_STREAMING_SCOPE_LABELS.UPDATED,
          variant: 'success',
        });
      } catch (error) {
        setScope(previous);
        const { message } = handleApiError(error);
        toast({
          title: '更新エラー',
          description:
            message ?? WATCHLIST_STREAMING_SCOPE_LABELS.UPDATE_FAILED,
          variant: 'error',
        });
      }
    },
    [scope, toast],
  );

  if (isLoading) {
    return (
      <div className={styles.c_streaming_notice_settings}>
        <Skeleton variant='text' width={280} height={14} />
        <Skeleton variant='rect' width={220} height={48} />
      </div>
    );
  }

  return (
    <div className={styles.c_streaming_notice_settings}>
      <p className={styles.c_streaming_notice_settings__description}>
        {WATCHLIST_STREAMING_SCOPE_LABELS.DESCRIPTION}
      </p>
      <RadioGroup
        options={SCOPE_OPTIONS}
        value={scope}
        onValueChange={handleChange}
        aria-label={WATCHLIST_STREAMING_SCOPE_LABELS.GROUP_ARIA}
      />
    </div>
  );
});

StreamingNoticeSettings.displayName = 'StreamingNoticeSettings';
