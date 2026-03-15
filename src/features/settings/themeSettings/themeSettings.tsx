/**
 * テーマ切り替えコンポーネント
 */

'use client';

import { memo, useCallback, useState, useEffect } from 'react';

import { Select } from '@/components/ui/select/select';
import { Skeleton } from '@/components/ui/skeleton/skeleton';
import { THEME_VALUES } from '@/schema/user';
import { getSettings, updateSettings } from '@/lib/api/user/user';
import { useToast } from '@/hooks/useToast';
import { handleApiError } from '@/utils/error';
import { STORAGE_KEYS } from '@/constants/common';
import styles from './themeSettings.module.scss';

/** テーマの選択肢 */
const THEME_OPTIONS = [
  { label: 'ライト', value: 'light' },
  { label: 'ダーク', value: 'dark' },
];

/**
 * テーマ切り替え設定
 */
export const ThemeSettings = memo(function ThemeSettings() {
  const { toast } = useToast();
  const [theme, setTheme] = useState<(typeof THEME_VALUES)[number]>('light');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchSettings = async () => {
      try {
        const settings = await getSettings();
        if (!cancelled) {
          setTheme(settings.theme);
        }
      } catch {
        // localStorageのキャッシュを使用
        const cached = localStorage.getItem(STORAGE_KEYS.THEME);
        if (!cancelled && (cached === 'light' || cached === 'dark')) {
          setTheme(cached);
        }
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
      const newTheme = value as (typeof THEME_VALUES)[number];
      const previousTheme = theme;
      setTheme(newTheme);

      // localStorageにキャッシュ
      localStorage.setItem(STORAGE_KEYS.THEME, newTheme);

      // HTML要素にdata-theme属性を設定
      document.documentElement.setAttribute('data-theme', newTheme);

      try {
        await updateSettings({ theme: newTheme });
        toast({
          title: 'テーマを変更しました',
          variant: 'success',
        });
      } catch (error) {
        // 失敗時は元に戻す
        setTheme(previousTheme);
        localStorage.setItem(STORAGE_KEYS.THEME, previousTheme);
        document.documentElement.setAttribute('data-theme', previousTheme);
        const { message } = handleApiError(error);
        toast({
          title: '更新エラー',
          description: message ?? 'テーマの変更に失敗しました',
          variant: 'error',
        });
      }
    },
    [theme, toast],
  );

  if (isLoading) {
    return (
      <div className={styles.c_theme_settings}>
        <div className={styles.c_theme_settings__select}>
          <Skeleton variant='rect' width={200} height={36} />
        </div>
        <Skeleton variant='text' width={160} height={14} />
      </div>
    );
  }

  return (
    <div className={styles.c_theme_settings}>
      <div className={styles.c_theme_settings__select}>
        <Select
          label='テーマ'
          options={THEME_OPTIONS}
          value={theme}
          onValueChange={handleChange}
          aria-label='テーマを選択'
        />
      </div>
      <p className={styles.c_theme_settings__description}>
        アプリの外観を切り替えます
      </p>
    </div>
  );
});

ThemeSettings.displayName = 'ThemeSettings';
