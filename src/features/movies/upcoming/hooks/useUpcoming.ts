/**
 * 公開予定映画のカスタムフック
 */

import { useMemo } from 'react';

import { useMovieList } from '@/features/movies/hooks/useMovieList';
import type { DateRange } from '@/features/movies/types';

/**
 * 今日の日付をYYYY-MM-DD形式で取得
 */
function getToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 公開予定映画のカスタムフック
 * release_date >= today（APIのデフォルト動作）
 */
export function useUpcoming() {
  const defaultDateRange: DateRange = useMemo(
    () => ({
      gte: getToday(),
    }),
    [],
  );

  return useMovieList({ timeFrame: 'upcoming', defaultDateRange });
}
