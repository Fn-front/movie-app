/**
 * カレンダー カスタムフック
 * 月間カレンダー表示用のデータ取得・状態管理
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getCalendarMovies,
  type CalendarMovieItem,
} from '@/lib/api/calendar/calendar';
import { calendarKeys } from '@/constants';

/**
 * 月文字列をYYYY-MM形式で生成
 */
function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * useCalendarフックの返り値
 */
export interface UseCalendarReturn {
  /** 表示中の月 */
  currentMonth: Date;
  /** 選択中の日付 */
  selectedDate: Date | undefined;
  /** 日付ごとの映画マップ */
  moviesByDate: Record<string, CalendarMovieItem[]>;
  /** 選択中の日付の映画一覧 */
  selectedDateMovies: CalendarMovieItem[];
  /** 映画がある日付の一覧 */
  datesWithMovies: Date[];
  /** 前月に切り替え */
  goToPreviousMonth: () => void;
  /** 次月に切り替え */
  goToNextMonth: () => void;
  /** 日付を選択 */
  selectDate: (date: Date | undefined) => void;
  /** キャッシュをクリアして再取得 */
  resetCache: () => void;
  /** ローディング中 */
  isLoading: boolean;
  /** エラー */
  error: Error | null;
}

/**
 * カレンダー カスタムフック
 */
export function useCalendar(): UseCalendarReturn {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const queryClient = useQueryClient();
  const cachedMonths = useRef<Set<string>>(new Set());

  const monthStr = useMemo(() => formatMonth(currentMonth), [currentMonth]);

  // 月データ取得
  const calendarQuery = useQuery({
    queryKey: calendarKeys.month(monthStr),
    queryFn: () => getCalendarMovies({ month: monthStr }),
    staleTime: Infinity,
  });

  // キャッシュ済み月を追跡
  if (calendarQuery.data && !cachedMonths.current.has(monthStr)) {
    cachedMonths.current.add(monthStr);
  }

  // 日付ごとの映画マップ
  const moviesByDate = useMemo(
    () => calendarQuery.data?.data.movies_by_date ?? {},
    [calendarQuery.data],
  );

  // 選択中の日付の映画一覧
  const selectedDateMovies = useMemo(() => {
    if (!selectedDate) return [];
    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    return moviesByDate[dateStr] ?? [];
  }, [selectedDate, moviesByDate]);

  // 映画がある日付の一覧
  const datesWithMovies = useMemo(() => {
    return Object.keys(moviesByDate).map((dateStr) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d);
    });
  }, [moviesByDate]);

  const goToPreviousMonth = useCallback(() => {
    setCurrentMonth((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
    setSelectedDate(undefined);
  }, []);

  const goToNextMonth = useCallback(() => {
    setCurrentMonth((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
    setSelectedDate(undefined);
  }, []);

  const selectDate = useCallback((date: Date | undefined) => {
    setSelectedDate(date);
  }, []);

  const resetCache = useCallback(() => {
    cachedMonths.current.clear();
    setSelectedDate(undefined);
    queryClient.invalidateQueries({ queryKey: calendarKeys.all });
  }, [queryClient]);

  return useMemo(
    () => ({
      currentMonth,
      selectedDate,
      moviesByDate,
      selectedDateMovies,
      datesWithMovies,
      goToPreviousMonth,
      goToNextMonth,
      selectDate,
      resetCache,
      isLoading: calendarQuery.isLoading,
      error: calendarQuery.error,
    }),
    [
      currentMonth,
      selectedDate,
      moviesByDate,
      selectedDateMovies,
      datesWithMovies,
      goToPreviousMonth,
      goToNextMonth,
      selectDate,
      resetCache,
      calendarQuery.isLoading,
      calendarQuery.error,
    ],
  );
}
