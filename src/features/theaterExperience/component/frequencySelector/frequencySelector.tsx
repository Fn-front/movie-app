/**
 * FrequencySelectorコンポーネント
 * 低音/中音/高音の周波数帯を切り替えるトグルグループ
 */

'use client';

import { memo, useCallback } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';

import { cn } from '@/utils/cn';

import type { FrequencyBand } from '../../types';

import styles from './frequencySelector.module.scss';

const FREQUENCY_OPTIONS: readonly {
  value: FrequencyBand;
  label: string;
  frequency: string;
}[] = [
  { value: 'low', label: '低音', frequency: '80 Hz' },
  { value: 'mid', label: '中音', frequency: '1 kHz' },
  { value: 'high', label: '高音', frequency: '8 kHz' },
] as const;

export interface FrequencySelectorProps {
  /** 現在選択中の周波数帯 */
  value: FrequencyBand;
  /** 変更時コールバック */
  onValueChange: (value: FrequencyBand) => void;
  /** 追加クラス名 */
  className?: string;
}

export const FrequencySelector = memo<FrequencySelectorProps>(
  function FrequencySelector({ value, onValueChange, className }) {
    const handleValueChange = useCallback(
      (newValue: string) => {
        // 未選択状態を許可しない（同じボタンを再クリック時は無視）
        if (newValue) {
          onValueChange(newValue as FrequencyBand);
        }
      },
      [onValueChange],
    );

    return (
      <div className={cn(styles.c_frequency_selector, className)}>
        <span
          className={styles.c_frequency_selector__label}
          id='frequency-label'
        >
          周波数帯
        </span>
        <ToggleGroup.Root
          type='single'
          value={value}
          onValueChange={handleValueChange}
          aria-labelledby='frequency-label'
          className={styles.c_frequency_selector__group}
        >
          {FREQUENCY_OPTIONS.map((option) => (
            <ToggleGroup.Item
              key={option.value}
              value={option.value}
              aria-label={`${option.label}（${option.frequency}）`}
              className={styles.c_frequency_selector__item}
            >
              <span className={styles.c_frequency_selector__item_label}>
                {option.label}
              </span>
              <span className={styles.c_frequency_selector__item_freq}>
                {option.frequency}
              </span>
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>
    );
  },
);

FrequencySelector.displayName = 'FrequencySelector';
