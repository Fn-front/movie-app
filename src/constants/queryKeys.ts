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

export const personKeys = {
  all: ['person'] as const,
  detail: (personId: number) => ['person', 'detail', personId] as const,
};

export const filterKeys = {
  saved: ['savedFilter'] as const,
};

export const watchlistKeys = {
  all: ['watchlist'] as const,
  list: (params?: { sort?: string; excludeWatched?: boolean }) =>
    ['watchlist', 'list', params] as const,
  /** 視聴済みがある追加年の一覧 */
  watchedYears: () => ['watchlist', 'watchedYears'] as const,
  /**
   * 指定年の視聴済み一覧
   *
   * 年が未選択（null）の状態でもキーは組まれる（クエリ自体は enabled で止める）。
   * 架空の年 0 に丸めるとキャッシュの意味がずれるため、null のまま持つ。
   */
  watched: (year: number | null) => ['watchlist', 'watched', year] as const,
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
  /**
   * @param cacheBuster 手動同期直後の取り直し用。キーに含めないと
   *   React Query が前回の結果を返して古いデータが残る
   */
  year: (year: number, cacheBuster?: string) =>
    cacheBuster
      ? (['awards', year, cacheBuster] as const)
      : (['awards', year] as const),
};

export const theaterKeys = {
  all: ['theaters'] as const,
  list: ['theaters', 'list'] as const,
  detail: (slug: string) => ['theaters', slug] as const,
};
