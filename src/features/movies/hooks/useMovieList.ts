/**
 * 映画一覧の共通カスタムフック
 * upcoming / nowShowing / home で共有するロジック
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

import { getMovies } from '@/lib/api/movies/movies';
import type { MovieCacheItem } from '@/lib/api/movies/movies';
import { getSavedFilter, saveFilter } from '@/lib/api/filters/filters';
import { useToast } from '@/hooks/useToast';
import {
  DEFAULT_SORT,
  DEFAULT_RELEASE_TYPE,
  FILTER_ERROR_MESSAGES,
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
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  sortBy: string;
  releaseType: 'theatrical' | 'streaming';
  genres: Record<number, string>;
  selectedGenreIds: number[];
  dateRange: DateRange;
  isRevivalFilter: boolean | undefined;
  isFilterModalOpen: boolean;
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
 *
 * sort_by・release_typeは常に含める（デフォルト値も省略しない）。
 * 省略するとonSuccess時のキャッシュ上書きで値が消失し、
 * 再マウント時にデフォルトへフォールバックするバグの原因となる。
 */
function buildFilterConditions(
  sortBy: string,
  releaseType: 'theatrical' | 'streaming',
  genreIds: number[],
  dateRange: DateRange,
  isRevival: boolean | undefined,
): FilterConditions {
  const conditions: FilterConditions = {
    sort_by: sortBy as FilterConditions['sort_by'],
    release_type: releaseType,
  };
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
  const [savedFilterApplied, setSavedFilterApplied] = useState(false);
  const queryClient = useQueryClient();

  // 保存済みフィルターの取得
  const savedFilterQuery = useQuery({
    queryKey: filterKeys.saved,
    queryFn: getSavedFilter,
    enabled: isAuthenticated,
    staleTime: Infinity,
  });

  // 保存済みフィルターをUIステートに1回だけ反映
  // savedFilterQuery.dataはサーバー状態からUIローカル状態への初期同期のため、useEffect内のsetStateが必要
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (savedFilterApplied) return;
    if (!savedFilterQuery.data) return;

    setSavedFilterApplied(true);
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
  }, [savedFilterApplied, savedFilterQuery.data, defaultDateRange]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // フィルター準備完了の判定
  // 認証済みユーザーはsavedFilterの取得完了まで映画取得を待機
  const isFilterReady =
    status !== 'loading' &&
    (!isAuthenticated ||
      savedFilterQuery.isFetched ||
      savedFilterQuery.isError);

  // 映画一覧クエリのベースパラメータを構築（pageを除く）
  // useEffectによるstate同期前でも保存済みフィルターを直接参照してタイミングギャップを排除
  const moviesBaseParams = useMemo(() => {
    const saved =
      !savedFilterApplied && savedFilterQuery.data
        ? savedFilterQuery.data
        : undefined;

    const effectiveGenreIds = saved?.genre_ids ?? selectedGenreIds;

    return {
      sort_by: (saved?.sort_by ?? sortBy) as
        | 'release_date'
        | 'popularity'
        | 'vote_average',
      sort_order: defaultSortOrder,
      release_type: saved?.release_type ?? releaseType,
      time_frame: timeFrame,
      genre_ids:
        effectiveGenreIds.length > 0 ? effectiveGenreIds.join(',') : undefined,
      release_date_gte:
        (saved ? saved.date_range_gte : dateRange.gte) || undefined,
      release_date_lte:
        (saved ? saved.date_range_lte : dateRange.lte) || undefined,
      is_revival: saved ? saved.is_revival : isRevivalFilter,
    };
  }, [
    sortBy,
    defaultSortOrder,
    releaseType,
    timeFrame,
    selectedGenreIds,
    dateRange,
    isRevivalFilter,
    savedFilterApplied,
    savedFilterQuery.data,
  ]);

  // 映画一覧の無限スクロール取得
  const moviesQuery = useInfiniteQuery({
    queryKey: movieKeys.list(moviesBaseParams),
    queryFn: ({ pageParam, signal }) =>
      getMovies({ ...moviesBaseParams, page: pageParam }, { signal }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.data.pagination.nextPage ?? undefined,
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
  const { mutate: saveFilterMutate } = useMutation({
    mutationFn: saveFilter,
    onSuccess: (_data, variables) => {
      queryClient.setQueryData(filterKeys.saved, variables);
    },
    onError: () => {
      toast({
        title: 'エラー',
        description: FILTER_ERROR_MESSAGES.SAVE_FAILED,
        variant: 'error',
      });
    },
  });

  const saveFilterIfAuthenticated = useCallback(
    (conditions: FilterConditions) => {
      if (!isAuthenticated) return;
      saveFilterMutate(conditions);
    },
    [isAuthenticated, saveFilterMutate],
  );

  const handleSortChange = useCallback(
    (value: string) => {
      setSortBy(value);
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

  // 全ページの映画を結合
  const movies = useMemo(
    () => moviesQuery.data?.pages.flatMap((page) => page.data.movies) ?? [],
    [moviesQuery.data],
  );

  const genres = useMemo(
    () => moviesQuery.data?.pages[0]?.data.genres ?? {},
    [moviesQuery.data],
  );

  const isLoading = !isFilterReady || moviesQuery.isLoading;

  const fetchNextPage = useCallback(() => {
    moviesQuery.fetchNextPage();
  }, [moviesQuery]);

  return useMemo(
    () => ({
      movies,
      isLoading,
      isFetchingNextPage: moviesQuery.isFetchingNextPage,
      hasNextPage: moviesQuery.hasNextPage,
      fetchNextPage,
      sortBy,
      releaseType,
      genres,
      selectedGenreIds,
      dateRange,
      isRevivalFilter,
      isFilterModalOpen,
      handleSortChange,
      handleReleaseTypeChange,
      handleFilterApply,
      handleFilterModalOpen,
      handleFilterModalClose,
    }),
    [
      movies,
      isLoading,
      moviesQuery.isFetchingNextPage,
      moviesQuery.hasNextPage,
      fetchNextPage,
      sortBy,
      releaseType,
      genres,
      selectedGenreIds,
      dateRange,
      isRevivalFilter,
      isFilterModalOpen,
      handleSortChange,
      handleReleaseTypeChange,
      handleFilterApply,
      handleFilterModalOpen,
      handleFilterModalClose,
    ],
  );
}
