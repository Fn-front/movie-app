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

/**
 * availableYearsの最新年を算出する
 * データ未取得時はnullを返す
 */
function getLatestAvailableYear(
  data: AwardsResponseData | undefined,
): number | null {
  if (!data?.availableYears?.length) return null;
  return Math.max(...data.availableYears);
}

/**
 * @param cacheBuster URL の `t` クエリ。手動同期の直後に反映を確認するための
 *   取り直し用で、通常の閲覧では undefined。`/api/awards` は public キャッシュを
 *   返すため、これが無いとブラウザが古い結果を返す（実測で transferSize=0 を確認）
 */
export function useAwards(cacheBuster?: string): UseAwardsReturn {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [userSelectedYear, setUserSelectedYear] = useState<number | null>(null);

  const initialRequestYear = userSelectedYear ?? currentYear;

  // 初回リクエストでavailableYearsを取得
  const { data: initialData } = useQuery({
    queryKey: awardKeys.year(initialRequestYear, cacheBuster),
    queryFn: () => getAwards(initialRequestYear, cacheBuster),
  });

  // ユーザーが未選択の場合、availableYearsの最新年を使用
  const latestYear = getLatestAvailableYear(initialData);
  const selectedYear = userSelectedYear ?? latestYear ?? currentYear;

  // selectedYearのデータを取得（initialRequestYear === selectedYearの場合はキャッシュから）
  const { data, isLoading, isError } = useQuery({
    queryKey: awardKeys.year(selectedYear, cacheBuster),
    queryFn: () => getAwards(selectedYear, cacheBuster),
  });

  const handleYearChange = useCallback((value: string) => {
    setUserSelectedYear(Number(value));
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
