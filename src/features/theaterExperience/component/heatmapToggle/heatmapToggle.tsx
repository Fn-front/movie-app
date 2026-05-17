/**
 * HeatmapToggleコンポーネント
 * 音響ヒートマップの表示/非表示を切り替えるトグル
 */

'use client';

import { memo, useCallback } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';

import { cn } from '@/utils/cn';

import styles from './heatmapToggle.module.scss';

export interface HeatmapToggleProps {
  /** 表示中かどうか */
  visible: boolean;
  /** 切り替え時コールバック */
  onVisibleChange: (visible: boolean) => void;
  /** 追加クラス名 */
  className?: string;
}

export const HeatmapToggle = memo<HeatmapToggleProps>(function HeatmapToggle({
  visible,
  onVisibleChange,
  className,
}) {
  const handleValueChange = useCallback(
    (newValue: string) => {
      if (newValue === 'on' || newValue === 'off') {
        onVisibleChange(newValue === 'on');
      }
    },
    [onVisibleChange],
  );

  return (
    <div className={cn(styles.c_heatmap_toggle, className)}>
      <span
        className={styles.c_heatmap_toggle__label}
        id='heatmap-toggle-label'
      >
        音響ヒートマップ
      </span>
      <ToggleGroup.Root
        type='single'
        value={visible ? 'on' : 'off'}
        onValueChange={handleValueChange}
        aria-labelledby='heatmap-toggle-label'
        className={styles.c_heatmap_toggle__group}
      >
        <ToggleGroup.Item
          value='on'
          aria-label='ヒートマップを表示'
          className={styles.c_heatmap_toggle__item}
        >
          表示
        </ToggleGroup.Item>
        <ToggleGroup.Item
          value='off'
          aria-label='ヒートマップを非表示'
          className={styles.c_heatmap_toggle__item}
        >
          非表示
        </ToggleGroup.Item>
      </ToggleGroup.Root>
    </div>
  );
});

HeatmapToggle.displayName = 'HeatmapToggle';
