/**
 * HomePageのカスタムフック
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

import { getMovies } from '@/lib/api/movies/movies';
import type { MovieCacheItem, PaginationInfo } from '@/lib/api/movies/movies';
import { useToast } from '@/hooks/useToast';
import { DEFAULT_SORT } from '@/constants';

/**
 * useHomePageフックの戻り値
 */
export interface UseHomePageReturn {
  /** 映画リスト */
  movies: MovieCacheItem[];
  /** ページネーション情報 */
  pagination: PaginationInfo | null;
  /** ローディング状態 */
  isLoading: boolean;
  /** 現在のページ */
  page: number;
  /** ソート順 */
  sortBy: string;
  /** ページ変更 */
  handlePageChange: (page: number) => void;
  /** ソート変更 */
  handleSortChange: (value: string) => void;
}

/**
 * HomePageのカスタムフック
 */
export function useHomePage(): UseHomePageReturn {
  const [movies, setMovies] = useState<MovieCacheItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string>(DEFAULT_SORT);
  const { toast } = useToast();

  const fetchMovies = useCallback(
    async (currentPage: number, currentSortBy: string) => {
      setIsLoading(true);
      try {
        const response = await getMovies({
          page: currentPage,
          sort_by: currentSortBy as 'release_date' | 'popularity' | 'vote_average',
        });
        setMovies(response.data.movies);
        setPagination(response.data.pagination);
      } catch {
        toast({
          title: 'エラー',
          description: '映画データの取得に失敗しました。',
          variant: 'error',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    fetchMovies(page, sortBy);
  }, [page, sortBy, fetchMovies]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSortChange = useCallback((value: string) => {
    setSortBy(value);
    setPage(1);
  }, []);

  return useMemo(
    () => ({
      movies,
      pagination,
      isLoading,
      page,
      sortBy,
      handlePageChange,
      handleSortChange,
    }),
    [movies, pagination, isLoading, page, sortBy, handlePageChange, handleSortChange],
  );
}
