/**
 * 映画詳細カスタムフック
 */

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getMovieDetail } from '@/lib/api/movies/movies';
import { movieKeys } from '@/constants';
import type { MovieDetail } from '@/lib/types';

/**
 * useMovieDetailフックの返り値
 */
export interface UseMovieDetailReturn {
  movie: MovieDetail | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * 映画詳細を取得するカスタムフック
 *
 * @param movieId - 映画ID（nullの場合はクエリを無効化）
 * @returns 映画詳細データ
 */
export function useMovieDetail(movieId: number | null): UseMovieDetailReturn {
  const fetchMovieDetail = useCallback(
    () => getMovieDetail(movieId!),
    [movieId],
  );

  const query = useQuery({
    queryKey: movieKeys.detail(movieId!),
    queryFn: fetchMovieDetail,
    enabled: movieId !== null,
    select: (response) => response.data,
  });

  return {
    movie: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
