/**
 * TanStack Query クエリキーファクトリー
 */

import type { GetMoviesRequest } from '@/lib/api/movies/movies';

export const movieKeys = {
  all: ['movies'] as const,
  list: (params: Omit<GetMoviesRequest, 'page'>) => ['movies', params] as const,
  detail: (movieId: number) => ['movies', 'detail', movieId] as const,
};

export const filterKeys = {
  saved: ['savedFilter'] as const,
};
