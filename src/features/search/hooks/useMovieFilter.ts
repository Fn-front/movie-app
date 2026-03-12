/**
 * useMovieFilterフック
 * フィルター状態をURLパラメータと同期管理
 */

'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

/**
 * フィルターオプションの型
 */
export interface FilterOptions {
  /** ジャンルID配列 */
  genre?: number[];
  /** 公開年 */
  year?: number;
  /** 最低評価 */
  vote_average_gte?: number;
}

/**
 * useMovieFilterフックの返り値
 */
export interface UseMovieFilterReturn {
  /** 現在のフィルター状態 */
  currentFilters: FilterOptions;
  /** フィルターが適用されているか */
  hasActiveFilters: boolean;
  /** フィルター変更ハンドラー */
  handleFilterChange: (filters: FilterOptions) => void;
  /** フィルタークリアハンドラー */
  handleFilterClear: () => void;
}

/**
 * URLパラメータからフィルター状態を読み取る
 */
function parseFiltersFromParams(searchParams: URLSearchParams): FilterOptions {
  const genreParam = searchParams.get('genre');
  const yearParam = searchParams.get('year');
  const voteParam = searchParams.get('vote_average_gte');

  return {
    genre: genreParam
      ? genreParam
          .split(',')
          .map(Number)
          .filter((n) => !Number.isNaN(n))
      : undefined,
    year: yearParam ? Number(yearParam) : undefined,
    vote_average_gte: voteParam ? Number(voteParam) : undefined,
  };
}

/**
 * フィルター状態をURLパラメータに変換
 */
function buildSearchParamsFromFilters(
  currentParams: URLSearchParams,
  filters: FilterOptions,
): URLSearchParams {
  const params = new URLSearchParams(currentParams.toString());

  // ページをリセット
  params.delete('page');

  // ジャンル
  if (filters.genre && filters.genre.length > 0) {
    params.set('genre', filters.genre.join(','));
  } else {
    params.delete('genre');
  }

  // 公開年
  if (filters.year !== undefined) {
    params.set('year', String(filters.year));
  } else {
    params.delete('year');
  }

  // 最低評価
  if (filters.vote_average_gte !== undefined) {
    params.set('vote_average_gte', String(filters.vote_average_gte));
  } else {
    params.delete('vote_average_gte');
  }

  return params;
}

/**
 * 映画フィルターフック
 */
export function useMovieFilter(): UseMovieFilterReturn {
  const searchParams = useSearchParams();
  const router = useRouter();

  const currentFilters = useMemo(
    () => parseFiltersFromParams(searchParams),
    [searchParams],
  );

  const hasActiveFilters = useMemo(
    () =>
      (currentFilters.genre !== undefined && currentFilters.genre.length > 0) ||
      currentFilters.year !== undefined ||
      currentFilters.vote_average_gte !== undefined,
    [currentFilters],
  );

  const handleFilterChange = useCallback(
    (filters: FilterOptions) => {
      const params = buildSearchParamsFromFilters(searchParams, filters);
      router.push(`/search?${params.toString()}`);
    },
    [searchParams, router],
  );

  const handleFilterClear = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('genre');
    params.delete('year');
    params.delete('vote_average_gte');
    params.delete('page');
    router.push(`/search?${params.toString()}`);
  }, [searchParams, router]);

  return useMemo(
    () => ({
      currentFilters,
      hasActiveFilters,
      handleFilterChange,
      handleFilterClear,
    }),
    [currentFilters, hasActiveFilters, handleFilterChange, handleFilterClear],
  );
}
