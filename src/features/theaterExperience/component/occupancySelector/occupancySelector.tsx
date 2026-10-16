/**
 * OccupancySelectorコンポーネント
 * 客席の占有率（空席／半分／満席）を切り替える
 *
 * 占有率は「実際に人が座っていたらどう見えるか」を体感するための表示設定であり、
 * 席の評価指標（前席遮蔽率）には影響しない。遮蔽率は「前席に人が座っている前提」の
 * 最悪ケースで算出しており、誰がたまたま座っているかに左右されないため。
 */

'use client';

import { memo, useCallback } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';

import { cn } from '@/utils/cn';

import styles from './occupancySelector.module.scss';

/** 占有率の選択肢 */
export const OCCUPANCY_OPTIONS = [
  { value: 'empty', label: '空席', rate: 0 },
  { value: 'half', label: '半分', rate: 0.5 },
  { value: 'full', label: '満席', rate: 1 },
] as const;

/** 占有率の選択値 */
export type OccupancyLevel = (typeof OCCUPANCY_OPTIONS)[number]['value'];

/**
 * 選択値から占有率（0〜1）を返す。未知の値は空席として扱う。
 */
export function getOccupancyRate(level: OccupancyLevel): number {
  return OCCUPANCY_OPTIONS.find((o) => o.value === level)?.rate ?? 0;
}

export interface OccupancySelectorProps {
  /** 現在の占有率レベル */
  level: OccupancyLevel;
  /** 変更時コールバック */
  onLevelChange: (level: OccupancyLevel) => void;
  /** 追加クラス名 */
  className?: string;
}

export const OccupancySelector = memo<OccupancySelectorProps>(
  function OccupancySelector({ level, onLevelChange, className }) {
    const handleValueChange = useCallback(
      (newValue: string) => {
        const match = OCCUPANCY_OPTIONS.find((o) => o.value === newValue);
        // Radix は選択解除時に空文字を渡すため、既知の値のときだけ反映する
        if (match) onLevelChange(match.value);
      },
      [onLevelChange],
    );

    return (
      <div className={cn(styles.c_occupancy_selector, className)}>
        <span
          className={styles.c_occupancy_selector__label}
          id='occupancy-selector-label'
        >
          客席の入り
        </span>
        <ToggleGroup.Root
          type='single'
          value={level}
          onValueChange={handleValueChange}
          aria-labelledby='occupancy-selector-label'
          className={styles.c_occupancy_selector__group}
        >
          {OCCUPANCY_OPTIONS.map((option) => (
            <ToggleGroup.Item
              key={option.value}
              value={option.value}
              aria-label={`客席を${option.label}にする`}
              className={styles.c_occupancy_selector__item}
            >
              {option.label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>
    );
  },
);

OccupancySelector.displayName = 'OccupancySelector';
