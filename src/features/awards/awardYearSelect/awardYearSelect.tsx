/**
 * 受賞作品 年度セレクトコンポーネント
 */

'use client';

import { memo, useMemo } from 'react';

import { Select } from '@/components/ui/select/select';
import type { SelectOption } from '@/components/ui/select/select';

export interface AwardYearSelectProps {
  availableYears: number[];
  selectedYear: number;
  onYearChange: (value: string) => void;
  className?: string;
}

export const AwardYearSelect = memo<AwardYearSelectProps>(
  function AwardYearSelect({
    availableYears,
    selectedYear,
    onYearChange,
    className,
  }) {
    const options: SelectOption[] = useMemo(
      () =>
        availableYears.map((year) => ({
          label: `${year}`,
          value: String(year),
        })),
      [availableYears],
    );

    return (
      <Select
        options={options}
        value={String(selectedYear)}
        onValueChange={onYearChange}
        aria-label='年度を選択'
        className={className}
      />
    );
  },
);

AwardYearSelect.displayName = 'AwardYearSelect';
