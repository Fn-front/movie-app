/**
 * TanStack Query クエリキーファクトリー
 */

import type { GetMoviesRequest } from '@/lib/api/movies/movies';
import type { SearchMoviesRequest } from '@/lib/api/search/search';

export const movieKeys = {
  all: ['movies'] as const,
  list: (params: Omit<GetMoviesRequest, 'page'>) => ['movies', params] as const,
  detail: (movieId: number) => ['movies', 'detail', movieId] as const,
};

export const filterKeys = {
  saved: ['savedFilter'] as const,
};

export const watchlistKeys = {
  all: ['watchlist'] as const,
  list: (params?: { sort?: string }) => ['watchlist', 'list', params] as const,
};

export const calendarKeys = {
  all: ['calendar'] as const,
  month: (month: string) => ['calendar', month] as const,
};

export const searchKeys = {
  all: ['search'] as const,
  results: (params: SearchMoviesRequest) => ['search', params] as const,
};

export const titleSuggestionKeys = {
  all: ['titleSuggestion'] as const,
  query: (query: string) => ['titleSuggestion', query] as const,
};

export const genreKeys = {
  all: ['genres'] as const,
};

export const favoriteKeys = {
  all: ['favorites'] as const,
  list: (params?: { sort_by?: string; sort_order?: string }) =>
    ['favorites', 'list', params] as const,
};

export const recommendationKeys = {
  all: ['recommendations'] as const,
  refreshCount: ['recommendations', 'refreshCount'] as const,
};

export const awardKeys = {
  all: ['awards'] as const,
  year: (year: number) => ['awards', year] as const,
};
