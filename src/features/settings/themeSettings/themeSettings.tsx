/**
 * テーマ切り替えコンポーネント（設定ページ）
 * 共有フック useTheme を利用し、ユーザーメニューのスイッチと状態を共有する。
 * 保存値が system（OS追従）の場合は解決後の light/dark を選択表示する。
 */

'use client';

import { memo, useCallback } from 'react';

import { RadioGroup } from '@/components/ui/radioGroup/radioGroup';
import { useTheme } from '@/hooks/useTheme';
import type { ResolvedTheme } from '@/utils/theme';
import styles from './themeSettings.module.scss';

/** テーマの選択肢（切り替えは light/dark の2択） */
const THEME_OPTIONS = [
  { label: 'ライト', value: 'light' },
  { label: 'ダーク', value: 'dark' },
];

/**
 * テーマ切り替え設定
 */
export const ThemeSettings = memo(function ThemeSettings() {
  const { resolvedTheme, setTheme } = useTheme();

  const handleChange = useCallback(
    (value: string) => {
      if (value === 'light' || value === 'dark') {
        setTheme(value as ResolvedTheme);
      }
    },
    [setTheme],
  );

  return (
    <div className={styles.c_theme_settings}>
      <RadioGroup
        options={THEME_OPTIONS}
        value={resolvedTheme}
        onValueChange={handleChange}
        aria-label='テーマを選択'
      />
    </div>
  );
});

ThemeSettings.displayName = 'ThemeSettings';
