/**
 * TheaterSelectorコンポーネント
 * 劇場を選択するドロップダウン
 */

'use client';

import { memo, useCallback } from 'react';

import { Select } from '@/components/ui/select/select';
import { cn } from '@/utils/cn';

import type { TheaterListItem } from '../../types';

import styles from './theaterSelector.module.scss';

export interface TheaterSelectorProps {
  /** 劇場一覧 */
  theaters: TheaterListItem[];
  /** 現在選択中の劇場slug */
  value: string;
  /** 変更時コールバック */
  onValueChange: (slug: string) => void;
  /** 追加クラス名 */
  className?: string;
}

export const TheaterSelector = memo<TheaterSelectorProps>(
  function TheaterSelector({ theaters, value, onValueChange, className }) {
    const options = theaters.map((theater) => ({
      value: theater.slug,
      label: theater.name,
    }));

    const handleValueChange = useCallback(
      (newValue: string) => {
        onValueChange(newValue);
      },
      [onValueChange],
    );

    return (
      <div className={cn(styles.c_theater_selector, className)}>
        <Select
          label='劇場'
          options={options}
          value={value}
          onValueChange={handleValueChange}
          aria-label='劇場を選択'
        />
      </div>
    );
  },
);

TheaterSelector.displayName = 'TheaterSelector';
