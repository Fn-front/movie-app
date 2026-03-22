/**
 * 受賞作品データ取得・年度選択管理フック
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const hasInitialized = useRef(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: awardKeys.year(selectedYear),
    queryFn: () => getAwards(selectedYear),
  });

  // 初回データ取得時、availableYearsの最新年に切り替え
  useEffect(() => {
    if (hasInitialized.current || !data?.availableYears?.length) return;
    hasInitialized.current = true;

    const latestYear = Math.max(...data.availableYears);
    if (latestYear !== selectedYear) {
      setSelectedYear(latestYear);
    }
  }, [data, selectedYear]);

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
