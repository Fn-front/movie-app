/**
 * 公開中映画のカスタムフック
 */

import { useMemo } from 'react';

import { useMovieList } from '@/features/movies/hooks/useMovieList';
import { NOW_SHOWING_MONTHS_BACK } from '@/constants';
import type { DateRange } from '@/features/movies/types';

/**
 * 日付をYYYY-MM-DD形式にフォーマット
 */
function formatDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 公開中映画のカスタムフック
 * release_date >= today-2ヶ月 AND release_date <= today
 */
export function useNowShowing() {
  const defaultDateRange: DateRange = useMemo(() => {
    const now = new Date();
    const pastDate = new Date(now);
    pastDate.setMonth(pastDate.getMonth() - NOW_SHOWING_MONTHS_BACK);

    return {
      gte: formatDateToString(pastDate),
      lte: formatDateToString(now),
    };
  }, []);

  return useMovieList({
    timeFrame: 'now_showing',
    defaultSortOrder: 'desc',
    defaultDateRange,
  });
}
