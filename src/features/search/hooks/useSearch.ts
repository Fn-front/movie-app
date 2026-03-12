/**
 * useSearchフック
 * URLパラメータから検索条件を読み取り、検索APIを呼び出す
 */

'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { searchMoviesApi } from '@/lib/api/search/search';
import type { SearchMoviesRequest } from '@/lib/api/search/search';
import type { Movie } from '@/lib/types';
import { searchKeys, SEARCH_ERROR_MESSAGES } from '@/constants';
import { useToast } from '@/hooks/useToast';

/**
 * useSearchフックの返り値
 */
export interface UseSearchReturn {
  /** 検索キーワード */
  query: string;
  /** 検索結果の映画一覧 */
  movies: Movie[];
  /** 総件数 */
  totalResults: number;
  /** 現在のページ */
  currentPage: number;
  /** 総ページ数 */
  totalPages: number;
  /** ローディング中 */
  isLoading: boolean;
  /** エラー状態 */
  isError: boolean;
  /** ページ変更ハンドラー */
  handlePageChange: (page: number) => void;
}

/**
 * URLパラメータから検索リクエストパラメータを構築
 */
function buildSearchParams(
  searchParams: URLSearchParams,
): SearchMoviesRequest | null {
  const query = searchParams.get('query') ?? undefined;
  const page = searchParams.get('page');
  const genre = searchParams.get('genre') ?? undefined;
  const year = searchParams.get('year');
  const voteAverageGte = searchParams.get('vote_average_gte');

  const hasSearchCriteria = query || genre || year || voteAverageGte;
  if (!hasSearchCriteria) return null;

  return {
    query,
    page: page ? Number(page) : 1,
    genre,
    year: year ? Number(year) : undefined,
    vote_average_gte: voteAverageGte ? Number(voteAverageGte) : undefined,
  };
}

/**
 * 検索カスタムフック
 */
export function useSearch(): UseSearchReturn {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const requestParams = useMemo(
    () => buildSearchParams(searchParams),
    [searchParams],
  );

  const searchQuery = useQuery({
    queryKey: searchKeys.results(requestParams ?? { page: 1 }),
    queryFn: ({ signal }) => {
      if (!requestParams) {
        throw new Error('検索条件がありません');
      }
      return searchMoviesApi(requestParams, { signal });
    },
    enabled: requestParams !== null,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (searchQuery.isError) {
      toast({
        title: 'エラー',
        description: SEARCH_ERROR_MESSAGES.FETCH_FAILED,
        variant: 'error',
      });
    }
  }, [searchQuery.isError, toast]);

  const handlePageChange = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', String(page));
      router.push(`/search?${params.toString()}`);
    },
    [searchParams, router],
  );

  const query = searchParams.get('query') ?? '';
  const movies = useMemo(
    () => searchQuery.data?.data.movies ?? [],
    [searchQuery.data],
  );
  const pagination = searchQuery.data?.data.pagination;

  return useMemo(
    () => ({
      query,
      movies,
      totalResults: pagination?.totalResults ?? 0,
      currentPage: pagination?.page ?? 1,
      totalPages: pagination?.totalPages ?? 0,
      isLoading: searchQuery.isLoading,
      isError: searchQuery.isError,
      handlePageChange,
    }),
    [
      query,
      movies,
      pagination,
      searchQuery.isLoading,
      searchQuery.isError,
      handlePageChange,
    ],
  );
}
