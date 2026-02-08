/**
 * Tabsコンポーネント
 */

'use client';

import { type ReactNode, memo, useCallback } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import styles from './tabs.module.scss';

/**
 * タブ選択肢の型
 */
export interface TabOption {
  /** 表示ラベル */
  label: string;
  /** 値 */
  value: string;
  /** 無効状態 */
  disabled?: boolean;
}

/**
 * Tabsコンポーネントのプロパティ
 */
export interface TabsProps {
  /** タブ選択肢 */
  options: readonly TabOption[];
  /** 選択された値 */
  value: string;
  /** 値変更時のコールバック */
  onValueChange: (value: string) => void;
  /** カスタムクラス名 */
  className?: string;
  /** aria-label */
  'aria-label'?: string;
  /** タブコンテンツ（Tabs.Contentを使う場合） */
  children?: ReactNode;
}

/**
 * Tabsコンポーネント
 *
 * @example
 * ```tsx
 * <Tabs
 *   options={[
 *     { label: '劇場公開', value: 'theatrical' },
 *     { label: 'ストリーミング', value: 'streaming' },
 *   ]}
 *   value={releaseType}
 *   onValueChange={handleReleaseTypeChange}
 *   aria-label="リリースタイプ"
 * />
 * ```
 */
export const Tabs = memo<TabsProps>(function Tabs({
  options,
  value,
  onValueChange,
  className,
  'aria-label': ariaLabel,
  children,
}) {
  const handleValueChange = useCallback(
    (newValue: string) => {
      onValueChange(newValue);
    },
    [onValueChange],
  );

  const rootClassNames = [styles.c_tabs, className].filter(Boolean).join(' ');

  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={handleValueChange}
      className={rootClassNames}
    >
      <TabsPrimitive.List
        className={styles.c_tabs__list}
        aria-label={ariaLabel}
      >
        {options.map((option) => (
          <TabsPrimitive.Trigger
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className={styles.c_tabs__trigger}
          >
            {option.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
});

Tabs.displayName = 'Tabs';
