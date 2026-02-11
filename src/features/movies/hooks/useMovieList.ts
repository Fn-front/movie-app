/**
 * 映画一覧の共通カスタムフック
 * upcoming / nowShowing / home で共有するロジック
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getMovies } from '@/lib/api/movies/movies';
import type { MovieCacheItem, PaginationInfo } from '@/lib/api/movies/movies';
import { getSavedFilter, saveFilter } from '@/lib/api/filters/filters';
import { useToast } from '@/hooks/useToast';
import {
  DEFAULT_SORT,
  DEFAULT_RELEASE_TYPE,
  movieKeys,
  filterKeys,
} from '@/constants';
import type { FilterConditions } from '@/schema/filters';
import type { DateRange } from '@/features/movies/types';

/**
 * useMovieListフックのオプション
 */
export interface UseMovieListOptions {
  /** 時間枠（home では省略可） */
  timeFrame?: 'upcoming' | 'now_showing';
  /** デフォルトのソート順 */
  defaultSortOrder?: 'asc' | 'desc';
  /** デフォルトの日付範囲（ページ固有） */
  defaultDateRange: DateRange;
}

/**
 * useMovieListフックの返り値
 */
export interface UseMovieListReturn {
  movies: MovieCacheItem[];
  pagination: PaginationInfo | null;
  isLoading: boolean;
  page: number;
  sortBy: string;
  releaseType: 'theatrical' | 'streaming';
  genres: Record<number, string>;
  selectedGenreIds: number[];
  dateRange: DateRange;
  isRevivalFilter: boolean | undefined;
  isFilterModalOpen: boolean;
  handlePageChange: (page: number) => void;
  handleSortChange: (value: string) => void;
  handleReleaseTypeChange: (value: 'theatrical' | 'streaming') => void;
  handleFilterApply: (
    genreIds: number[],
    dateRange: DateRange,
    isRevival: boolean | undefined,
  ) => void;
  handleFilterModalOpen: () => void;
  handleFilterModalClose: () => void;
}

/**
 * 現在のフィルター状態からFilterConditionsを構築
 */
function buildFilterConditions(
  sortBy: string,
  releaseType: 'theatrical' | 'streaming',
  genreIds: number[],
  dateRange: DateRange,
  isRevival: boolean | undefined,
): FilterConditions {
  const conditions: FilterConditions = {};
  if (sortBy !== DEFAULT_SORT) {
    conditions.sort_by = sortBy as FilterConditions['sort_by'];
  }
  if (releaseType !== DEFAULT_RELEASE_TYPE) {
    conditions.release_type = releaseType;
  }
  if (genreIds.length > 0) {
    conditions.genre_ids = genreIds;
  }
  if (dateRange.gte) {
    conditions.date_range_gte = dateRange.gte;
  }
  if (dateRange.lte) {
    conditions.date_range_lte = dateRange.lte;
  }
  if (isRevival !== undefined) {
    conditions.is_revival = isRevival;
  }
  return conditions;
}

/**
 * 映画一覧の共通カスタムフック
 */
export function useMovieList(options: UseMovieListOptions): UseMovieListReturn {
  const { timeFrame, defaultSortOrder, defaultDateRange } = options;

  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string>(DEFAULT_SORT);
  const [releaseType, setReleaseType] = useState<'theatrical' | 'streaming'>(
    DEFAULT_RELEASE_TYPE,
  );
  const [selectedGenreIds, setSelectedGenreIds] = useState<number[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange);
  const [isRevivalFilter, setIsRevivalFilter] = useState<boolean | undefined>(
    undefined,
  );
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const { toast } = useToast();
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && !!session?.user;
  const savedFilterApplied = useRef(false);
  const queryClient = useQueryClient();

  // 保存済みフィルターの取得
  const savedFilterQuery = useQuery({
    queryKey: filterKeys.saved,
    queryFn: getSavedFilter,
    enabled: isAuthenticated,
    staleTime: Infinity,
  });

  // 保存済みフィルターをUIステートに1回だけ反映
  useEffect(() => {
    if (savedFilterApplied.current) return;
    if (!savedFilterQuery.data) return;

    savedFilterApplied.current = true;
    const conditions = savedFilterQuery.data;
    const hasConditions = Object.keys(conditions).length > 0;
    if (!hasConditions) return;

    setSortBy(conditions.sort_by || DEFAULT_SORT);
    setReleaseType(conditions.release_type || DEFAULT_RELEASE_TYPE);
    setSelectedGenreIds(conditions.genre_ids || []);
    setDateRange({
      gte: conditions.date_range_gte || defaultDateRange.gte,
      lte: conditions.date_range_lte || defaultDateRange.lte,
    });
    setIsRevivalFilter(conditions.is_revival);
  }, [savedFilterQuery.data, defaultDateRange]);

  // フィルター準備完了の判定
  const isFilterReady =
    status !== 'loading' &&
    (!isAuthenticated ||
      savedFilterQuery.isFetched ||
      savedFilterQuery.isError);

  // 映画一覧クエリのパラメータを構築
  const moviesQueryParams = useMemo(
    () => ({
      page,
      sort_by: sortBy as 'release_date' | 'popularity' | 'vote_average',
      sort_order: defaultSortOrder,
      release_type: releaseType,
      time_frame: timeFrame,
      genre_ids:
        selectedGenreIds.length > 0
          ? selectedGenreIds.join(',')
          : undefined,
      release_date_gte: dateRange.gte || undefined,
      release_date_lte: dateRange.lte || undefined,
      is_revival: isRevivalFilter,
    }),
    [
      page,
      sortBy,
      defaultSortOrder,
      releaseType,
      timeFrame,
      selectedGenreIds,
      dateRange,
      isRevivalFilter,
    ],
  );

  // 映画一覧の取得
  const moviesQuery = useQuery({
    queryKey: movieKeys.list(moviesQueryParams),
    queryFn: ({ signal }) => getMovies(moviesQueryParams, { signal }),
    enabled: isFilterReady,
  });

  // エラー時のトースト表示
  useEffect(() => {
    if (moviesQuery.error) {
      toast({
        title: 'エラー',
        description: '映画データの取得に失敗しました。',
        variant: 'error',
      });
    }
  }, [moviesQuery.error, toast]);

  // フィルター保存のmutation
  const saveFilterMutation = useMutation({
    mutationFn: saveFilter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: filterKeys.saved });
    },
  });

  const saveFilterIfAuthenticated = useCallback(
    (conditions: FilterConditions) => {
      if (!isAuthenticated) return;
      saveFilterMutation.mutate(conditions);
    },
    [isAuthenticated, saveFilterMutation],
  );

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    const main = document.querySelector('main');
    if (main) {
      main.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const handleSortChange = useCallback(
    (value: string) => {
      setSortBy(value);
      setPage(1);
      saveFilterIfAuthenticated(
        buildFilterConditions(
          value,
          releaseType,
          selectedGenreIds,
          dateRange,
          isRevivalFilter,
        ),
      );
    },
    [
      releaseType,
      selectedGenreIds,
      dateRange,
      isRevivalFilter,
      saveFilterIfAuthenticated,
    ],
  );

  const handleReleaseTypeChange = useCallback(
    (value: 'theatrical' | 'streaming') => {
      setReleaseType(value);
      setPage(1);
      saveFilterIfAuthenticated(
        buildFilterConditions(
          sortBy,
          value,
          selectedGenreIds,
          dateRange,
          isRevivalFilter,
        ),
      );
    },
    [
      sortBy,
      selectedGenreIds,
      dateRange,
      isRevivalFilter,
      saveFilterIfAuthenticated,
    ],
  );

  const handleFilterApply = useCallback(
    (
      genreIds: number[],
      newDateRange: DateRange,
      isRevival: boolean | undefined,
    ) => {
      setSelectedGenreIds(genreIds);
      setDateRange(newDateRange);
      setIsRevivalFilter(isRevival);
      setPage(1);
      setIsFilterModalOpen(false);
      saveFilterIfAuthenticated(
        buildFilterConditions(
          sortBy,
          releaseType,
          genreIds,
          newDateRange,
          isRevival,
        ),
      );
    },
    [sortBy, releaseType, saveFilterIfAuthenticated],
  );

  const handleFilterModalOpen = useCallback(() => {
    setIsFilterModalOpen(true);
  }, []);

  const handleFilterModalClose = useCallback(() => {
    setIsFilterModalOpen(false);
  }, []);

  // サーバーステートの導出
  const movies = moviesQuery.data?.data.movies ?? [];
  const pagination = moviesQuery.data?.data.pagination ?? null;
  const genres = moviesQuery.data?.data.genres ?? {};
  const isLoading = !isFilterReady || moviesQuery.isLoading || moviesQuery.isFetching;

  return useMemo(
    () => ({
      movies,
      pagination,
      isLoading,
      page,
      sortBy,
      releaseType,
      genres,
      selectedGenreIds,
      dateRange,
      isRevivalFilter,
      isFilterModalOpen,
      handlePageChange,
      handleSortChange,
      handleReleaseTypeChange,
      handleFilterApply,
      handleFilterModalOpen,
      handleFilterModalClose,
    }),
    [
      movies,
      pagination,
      isLoading,
      page,
      sortBy,
      releaseType,
      genres,
      selectedGenreIds,
      dateRange,
      isRevivalFilter,
      isFilterModalOpen,
      handlePageChange,
      handleSortChange,
      handleReleaseTypeChange,
      handleFilterApply,
      handleFilterModalOpen,
      handleFilterModalClose,
    ],
  );
}
