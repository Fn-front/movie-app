/**
 * Tabsコンポーネント
 */

'use client';

import { type ReactNode, memo, useCallback } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/utils/cn';

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
  /** タブパネルのクラス名 */
  contentClassName?: string;
  /** aria-label */
  'aria-label'?: string;
  /** 選択中タブのパネルに描画する内容 */
  children: ReactNode;
}

/**
 * Tabsコンポーネント
 *
 * children は選択中タブのパネル（role="tabpanel"）として描画される。
 * パネルを省略すると Trigger の aria-controls が存在しないIDを指してしまうため、
 * children は必須。
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
 * >
 *   <MovieGrid movies={movies} />
 * </Tabs>
 * ```
 */
export const Tabs = memo<TabsProps>(function Tabs({
  options,
  value,
  onValueChange,
  className,
  contentClassName,
  'aria-label': ariaLabel,
  children,
}) {
  const handleValueChange = useCallback(
    (newValue: string) => {
      onValueChange(newValue);
    },
    [onValueChange],
  );

  const rootClassNames = cn(styles.c_tabs, className);

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
      {/*
        value と同じ値のパネルを常に描画し、選択中 Trigger の aria-controls が
        実在するパネルを指すようにする。非選択の Trigger は aria-selected="false"
        のため、ブラウザ・支援技術ともに aria-controls を参照しない。
      */}
      <TabsPrimitive.Content value={value} className={contentClassName}>
        {children}
      </TabsPrimitive.Content>
    </TabsPrimitive.Root>
  );
});

Tabs.displayName = 'Tabs';
