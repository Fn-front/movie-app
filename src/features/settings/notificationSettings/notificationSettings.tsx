/**
 * 通知設定コンポーネント
 */

'use client';

import { memo, useCallback, useState, useEffect } from 'react';

import { Checkbox } from '@/components/ui/checkbox/checkbox';
import { getSettings, updateSettings } from '@/lib/api/user/user';
import { useToast } from '@/hooks/useToast';
import { handleApiError } from '@/utils/error';
import styles from './notificationSettings.module.scss';

/**
 * 通知設定
 */
export const NotificationSettings = memo(function NotificationSettings() {
  const { toast } = useToast();
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchSettings = async () => {
      try {
        const settings = await getSettings();
        if (!cancelled) {
          setNotificationEnabled(settings.notificationEnabled);
        }
      } catch {
        // デフォルト値のまま
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
    async (checked: boolean) => {
      setNotificationEnabled(checked);

      try {
        await updateSettings({ notificationEnabled: checked });
        toast({
          title: '通知設定を更新しました',
          variant: 'success',
        });
      } catch (error) {
        // 失敗時は元に戻す
        setNotificationEnabled(!checked);
        const { message } = handleApiError(error);
        toast({
          title: '更新エラー',
          description: message ?? '通知設定の更新に失敗しました',
          variant: 'error',
        });
      }
    },
    [toast],
  );

  if (isLoading) return null;

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
