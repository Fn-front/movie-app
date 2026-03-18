/**
 * useGenresフック
 * ジャンル一覧をTanStack Queryで取得・キャッシュ
 */

'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getGenresApi } from '@/lib/api/genres/genres';
import { genreKeys, GENRE_CACHE_DURATION_MS } from '@/constants';
import type { Genre } from '@/lib/types';

/**
 * useGenresフックの返り値
 */
export interface UseGenresReturn {
  /** ジャンル一覧 */
  genres: Genre[];
  /** ローディング中 */
  isLoading: boolean;
  /** エラー状態 */
  isError: boolean;
}

/**
 * ジャンル一覧取得フック
 */
export function useGenres(): UseGenresReturn {
  const genresQuery = useQuery({
    queryKey: genreKeys.all,
    queryFn: () => getGenresApi(),
    staleTime: GENRE_CACHE_DURATION_MS,
    gcTime: GENRE_CACHE_DURATION_MS,
  });

  const genres = useMemo(
    () => genresQuery.data?.data.genres ?? [],
    [genresQuery.data],
  );

  return useMemo(
    () => ({
      genres,
      isLoading: genresQuery.isLoading,
      isError: genresQuery.isError,
    }),
    [genres, genresQuery.isLoading, genresQuery.isError],
  );
}
