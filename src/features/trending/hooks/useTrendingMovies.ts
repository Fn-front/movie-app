/**
 * トレンド映画 カスタムフック
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { trendingKeys, TRENDING_STALE_TIME } from '@/constants';
import { getTrendingMovies } from '@/lib/api/trending/trending';
import type { TrendingMovie } from '@/lib/types';

/**
 * useTrendingMoviesフックの返り値
 */
export interface UseTrendingMoviesReturn {
  /** トレンド映画一覧 */
  trendingMovies: TrendingMovie[];
  /** 読み込み中 */
  isLoading: boolean;
  /** エラー */
  isError: boolean;
}

/**
 * トレンド映画一覧を取得するカスタムフック
 */
export function useTrendingMovies(): UseTrendingMoviesReturn {
  const { data, isLoading, isError } = useQuery({
    queryKey: trendingKeys.all,
    queryFn: getTrendingMovies,
    staleTime: TRENDING_STALE_TIME,
  });

  return useMemo(
    () => ({
      trendingMovies: data ?? [],
      isLoading,
      isError,
    }),
    [data, isLoading, isError],
  );
}
