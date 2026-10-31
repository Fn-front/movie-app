/**
 * useSearchフック
 * URLパラメータから検索条件を読み取り、検索APIを呼び出す
 */

'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

import { searchMoviesApi } from '@/lib/api/search/search';
import type { SearchMoviesRequest } from '@/lib/api/search/search';
import type { Movie } from '@/lib/types';
import { searchKeys, SEARCH_ERROR_MESSAGES } from '@/constants';
import { useToast } from '@/hooks/useToast';
import {
  clearStoredSuggestion,
  readSuggestionForQuery,
} from '../utils/storedSuggestion';
import { useTitleSuggestion } from './useTitleSuggestion';

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
  /** 原題提案候補 */
  suggestions: string[];
  /** 原題提案ローディング中 */
  isSuggestionLoading: boolean;
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
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';

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

  // 提案クリックで引き継いだ候補を読み出す。保存値が現在のqueryに対応しない
  // （＝別キーワードを検索しただけ）なら引き継がず、AI提案を走らせる
  const storedSuggestion = useMemo(
    () => readSuggestionForQuery(query),
    [query],
  );

  // いま表示しているクエリ自身は選択肢から外す。押しても同じURLへ遷移するだけで
  // 画面が変わらず、候補が1件だけだと手詰まりになる（#887）
  const storedSuggestions = useMemo(
    () => storedSuggestion.suggestions.filter((title) => title !== query),
    [storedSuggestion, query],
  );

  // 対応しない保存値（別キーワード・旧形式・壊れた値）は取り除く。
  // 描画中に消すとSearchBarのstartTransitionやStrictModeで破棄される
  // レンダーでも消えてしまうため、確定後のEffectで行う
  useEffect(() => {
    if (storedSuggestion.isStale) {
      clearStoredSuggestion();
    }
  }, [storedSuggestion]);

  // keepPreviousDataにより、クエリ切替中はisLoadingがfalseのまま前クエリの結果が返る。
  // この区間で0件と誤判定しないよう、現在のクエリの結果が確定していることを条件にする
  const isResultSettled =
    !searchQuery.isLoading &&
    !searchQuery.isFetching &&
    !searchQuery.isPlaceholderData;

  // 引き継いだ候補が現在のクエリだけだった場合も「提案クリックからの遷移」に
  // 変わりはない。除外後の件数で判定するとAIを呼び直してしまう（#824のコスト抑制）
  const isFromSuggestionClick = storedSuggestion.suggestions.length > 0;

  // 検索結果が0件かつ提案クリック由来でない場合のみ原題提案APIを有効化
  // 提案クリックからの遷移ならAI呼び出し不要
  // 未認証時はAI検索を無効化
  const hasNoResults =
    isAuthenticated &&
    isResultSettled &&
    requestParams !== null &&
    movies.length === 0 &&
    !isFromSuggestionClick;
  const { suggestions: apiSuggestions, isLoading: isSuggestionLoading } =
    useTitleSuggestion(query, hasNoResults);

  // API提案を優先し、無ければ提案クリックで引き継いだ候補を使う。
  // 未認証では引き継ぎ分も表示しない（同じタブでログアウトした場合に残るため）
  const suggestions = useMemo(() => {
    if (!isAuthenticated) return [];
    return apiSuggestions.length > 0 ? apiSuggestions : storedSuggestions;
  }, [isAuthenticated, apiSuggestions, storedSuggestions]);

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
      suggestions,
      isSuggestionLoading,
    }),
    [
      query,
      movies,
      pagination,
      searchQuery.isLoading,
      searchQuery.isError,
      handlePageChange,
      suggestions,
      isSuggestionLoading,
    ],
  );
}
