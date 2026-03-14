/**
 * 劇場公開中の人気映画 カスタムフック
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { nowShowingKeys, NOW_SHOWING_STALE_TIME } from '@/constants';
import { getNowShowingMovies } from '@/lib/api/nowShowing/nowShowing';
import type { TrendingMovie } from '@/lib/types';

/**
 * useNowShowingMoviesフックの返り値
 */
export interface UseNowShowingMoviesReturn {
  /** 劇場公開中の人気映画一覧 */
  nowShowingMovies: TrendingMovie[];
  /** 読み込み中 */
  isLoading: boolean;
  /** エラー */
  isError: boolean;
}

/**
 * 劇場公開中の人気映画一覧を取得するカスタムフック
 */
export function useNowShowingMovies(): UseNowShowingMoviesReturn {
  const { data, isLoading, isError } = useQuery({
    queryKey: nowShowingKeys.all,
    queryFn: getNowShowingMovies,
    staleTime: NOW_SHOWING_STALE_TIME,
  });

  return useMemo(
    () => ({
      nowShowingMovies: data ?? [],
      isLoading,
      isError,
    }),
    [data, isLoading, isError],
  );
}
