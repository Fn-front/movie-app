/**
 * 通知設定コンポーネント
 */

'use client';

import { memo, useCallback, useState } from 'react';

import { Checkbox } from '@/components/ui/checkbox/checkbox';
import { Skeleton } from '@/components/ui/skeleton/skeleton';
import { updateSettings } from '@/lib/api/user/user';
import { useToastDispatch } from '@/hooks/useToast';
import { handleApiError } from '@/utils/error';

import { useUserSettings } from '../hooks/useUserSettings';
import { SettingsLoadError } from '../settingsLoadError/settingsLoadError';
import styles from './notificationSettings.module.scss';

/**
 * 通知設定
 */
export const NotificationSettings = memo(function NotificationSettings() {
  const { toast } = useToastDispatch();
  const { settings, isLoading, hasFailed, retry } = useUserSettings();
  // サーバーの値をそのまま描き、**操作した間だけ** override を上に被せる。
  // 以前のように effect で state へ写すと、読めなかったときに既定値
  // （false）が残って「オフ」と確定表示される
  const [override, setOverride] = useState<boolean | null>(null);
  const notificationEnabled =
    override ?? settings?.notificationEnabled ?? false;

  const handleChange = useCallback(
    async (checked: boolean) => {
      // 失敗したら直前の**表示値**へ戻す。サーバー値へ戻すと、2回目以降の
      // 操作が失敗したときに1回目の成功ぶんまで巻き戻る
      const previous = notificationEnabled;
      setOverride(checked);

      try {
        await updateSettings({ notificationEnabled: checked });
        toast({
          title: '通知設定を更新しました',
          variant: 'success',
        });
      } catch (error) {
        setOverride(previous);
        const { message } = handleApiError(error);
        toast({
          title: '更新エラー',
          description: message ?? '通知設定の更新に失敗しました',
          variant: 'error',
        });
      }
    },
    [notificationEnabled, toast],
  );

  if (isLoading) {
    return (
      <div className={styles.c_notification_settings}>
        <Skeleton variant='rect' width={200} height={20} />
        <Skeleton variant='text' width={280} height={14} />
      </div>
    );
  }

  // ⚠️ 読めなかったら既定値を**確定値として描かない**（#1163）。
  // オンの通知が「オフ」と表示され、入れ直すと updateSettings が走って
  // 表示の誤りがデータの誤りに変わる
  if (hasFailed) {
    return (
      <div className={styles.c_notification_settings}>
        <SettingsLoadError label='通知設定' onRetry={retry} />
      </div>
    );
  }

  return (
    <div className={styles.c_notification_settings}>
      <Checkbox
        label='公開日リマインダーを受け取る'
        checked={notificationEnabled}
        onCheckedChange={handleChange}
      />
      <p className={styles.c_notification_settings__description}>
        ウォッチリストに追加した映画の公開日が近づいたら通知します
      </p>
    </div>
  );
});

NotificationSettings.displayName = 'NotificationSettings';
