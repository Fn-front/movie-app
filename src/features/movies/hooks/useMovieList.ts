/**
 * 映画一覧の共通カスタムフック
 * upcoming / nowShowing / home で共有するロジック
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
  MOVIES_ERROR_MESSAGES,
  movieKeys,
  filterKeys,
} from '@/constants';
import {
  buildFilterSearchParams,
  parseFilterConditionsFromParams,
} from '@/features/movies/utils/movieFilterParams';
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

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URLのフィルターを初期stateに注入する。
  // useEffectでの後追い反映だと、初期レンダリングで一瞬デフォルト値が表示される。
  // 初期化は1回だけ（以降のURL変更は自前のrouter.replaceによるもののため追従不要）。
  const [urlFilters] = useState<FilterConditions>(() =>
    parseFilterConditionsFromParams(
      new URLSearchParams(searchParams.toString()),
    ),
  );
  const hasUrlFilters = Object.keys(urlFilters).length > 0;

  const [sortBy, setSortBy] = useState<string>(
    urlFilters.sort_by ?? DEFAULT_SORT,
  );
  const [releaseType, setReleaseType] = useState<'theatrical' | 'streaming'>(
    urlFilters.release_type ?? DEFAULT_RELEASE_TYPE,
  );
  const [selectedGenreIds, setSelectedGenreIds] = useState<number[]>(
    urlFilters.genre_ids ?? [],
  );
  const [dateRange, setDateRange] = useState<DateRange>({
    gte: urlFilters.date_range_gte ?? defaultDateRange.gte,
    lte: urlFilters.date_range_lte ?? defaultDateRange.lte,
  });
  const [isRevivalFilter, setIsRevivalFilter] = useState<boolean | undefined>(
    urlFilters.is_revival,
  );
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const { toast } = useToast();
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && !!session?.user;
  // URLにフィルターがある場合はそれを唯一の正とし、保存済みフィルターで上書きしない
  const [savedFilterApplied, setSavedFilterApplied] = useState(hasUrlFilters);
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
        description: MOVIES_ERROR_MESSAGES.FETCH_FAILED,
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

  /**
   * フィルター状態をURLに反映する
   *
   * 同一ページ内の状態変化のため replace（履歴を積まない）。
   * ページ固有のデフォルト日付範囲はURLに書かない。書いてしまうと、
   * 並び順を変えただけでその日の既定範囲が固定され、翌日以降も
   * 古い範囲で絞り込まれてしまうため。
   */
  const syncFiltersToUrl = useCallback(
    (conditions: FilterConditions) => {
      const urlConditions: FilterConditions = { ...conditions };
      if (urlConditions.date_range_gte === defaultDateRange.gte) {
        delete urlConditions.date_range_gte;
      }
      if (urlConditions.date_range_lte === defaultDateRange.lte) {
        delete urlConditions.date_range_lte;
      }

      const params = buildFilterSearchParams(
        new URLSearchParams(searchParams.toString()),
        urlConditions,
      );
      const queryString = params.toString();

      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname, searchParams, defaultDateRange],
  );

  /** フィルター変更をURL反映とサーバー保存の両方に伝える */
  const persistFilters = useCallback(
    (conditions: FilterConditions) => {
      syncFiltersToUrl(conditions);
      saveFilterIfAuthenticated(conditions);
    },
    [syncFiltersToUrl, saveFilterIfAuthenticated],
  );

  const handleSortChange = useCallback(
    (value: string) => {
      setSortBy(value);
      persistFilters(
        buildFilterConditions(
          value,
          releaseType,
          selectedGenreIds,
          dateRange,
          isRevivalFilter,
        ),
      );
    },
    [releaseType, selectedGenreIds, dateRange, isRevivalFilter, persistFilters],
  );

  const handleReleaseTypeChange = useCallback(
    (value: 'theatrical' | 'streaming') => {
      setReleaseType(value);
      persistFilters(
        buildFilterConditions(
          sortBy,
          value,
          selectedGenreIds,
          dateRange,
          isRevivalFilter,
        ),
      );
    },
    [sortBy, selectedGenreIds, dateRange, isRevivalFilter, persistFilters],
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
      persistFilters(
        buildFilterConditions(
          sortBy,
          releaseType,
          genreIds,
          newDateRange,
          isRevival,
        ),
      );
    },
    [sortBy, releaseType, persistFilters],
  );

  const handleFilterModalOpen = useCallback(() => {
    setIsFilterModalOpen(true);
  }, []);

  const handleFilterModalClose = useCallback(() => {
    setIsFilterModalOpen(false);
  }, []);

  // 全ページの映画を結合（ページ間の重複を除去）
  const movies = useMemo(() => {
    const allMovies =
      moviesQuery.data?.pages.flatMap((page) => page.data.movies) ?? [];
    const seen = new Set<number>();
    return allMovies.filter((movie) => {
      if (seen.has(movie.id)) return false;
      seen.add(movie.id);
      return true;
    });
  }, [moviesQuery.data]);

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
