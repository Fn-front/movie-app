/**
 * 受賞作品データ取得・年度選択管理フック
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { awardKeys } from '@/constants';
import { getAwards } from '@/lib/api/awards/awards';
import type { AwardsResponseData } from '@/features/awards/types';

export interface UseAwardsReturn {
  data: AwardsResponseData | undefined;
  isLoading: boolean;
  isError: boolean;
  selectedYear: number;
  handleYearChange: (value: string) => void;
}

export function useAwards(): UseAwardsReturn {
  const [selectedYear, setSelectedYear] = useState<number>(() =>
    new Date().getFullYear(),
  );

  const { data, isLoading, isError } = useQuery({
    queryKey: awardKeys.year(selectedYear),
    queryFn: () => getAwards(selectedYear),
  });

  const handleYearChange = useCallback((value: string) => {
    setSelectedYear(Number(value));
  }, []);

  return useMemo(
    () => ({
      data,
      isLoading,
      isError,
      selectedYear,
      handleYearChange,
    }),
    [data, isLoading, isError, selectedYear, handleYearChange],
  );
}
