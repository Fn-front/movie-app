/**
 * 配信開始のお知らせ設定コンポーネント
 */

'use client';

import { memo, useCallback, useState } from 'react';

import { RadioGroup } from '@/components/ui/radioGroup/radioGroup';
import { Skeleton } from '@/components/ui/skeleton/skeleton';
import {
  STREAMING_SCOPE_DEFAULT,
  WATCHLIST_STREAMING_SCOPE_LABELS,
} from '@/constants';
import type { StreamingScope } from '@/constants';
import { useToastDispatch } from '@/hooks/useToast';
import { updateSettings } from '@/lib/api/user/user';
import { handleApiError } from '@/utils/error';

import { useUserSettings } from '../hooks/useUserSettings';
import { SettingsLoadError } from '../settingsLoadError/settingsLoadError';
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
  const { toast } = useToastDispatch();
  const { settings, isLoading, hasFailed, retry } = useUserSettings();
  // サーバーの値をそのまま描き、**操作した間だけ** override を上に被せる。
  // 以前のように effect で state へ写すと、読めなかったときに既定値が
  // 残って「レンタル・購入も含める」が選択済みとして確定表示される
  const [override, setOverride] = useState<StreamingScope | null>(null);
  const scope =
    override ?? settings?.streamingNoticeScope ?? STREAMING_SCOPE_DEFAULT;

  const handleChange = useCallback(
    async (value: string) => {
      const next = value as StreamingScope;
      // 失敗したら直前の**表示値**へ戻す
      const previous = scope;
      setOverride(next);

      try {
        await updateSettings({ streamingNoticeScope: next });
        toast({
          title: WATCHLIST_STREAMING_SCOPE_LABELS.UPDATED,
          variant: 'success',
        });
      } catch (error) {
        setOverride(previous);
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

  // ⚠️ 読めなかったら既定値を**確定値として描かない**（#1163）。
  // 「定額見放題のみ」にしてある利用者に「レンタル・購入も含める」が
  // 選択済みとして表示され、選び直すと設定そのものが変わる
  if (hasFailed) {
    return (
      <div className={styles.c_streaming_notice_settings}>
        <SettingsLoadError label='配信開始のお知らせ設定' onRetry={retry} />
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
