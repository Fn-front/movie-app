/**
 * 映画一覧の共通カスタムフック
 * upcoming / nowShowing で共有するロジック
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';

import { getMovies } from '@/lib/api/movies/movies';
import type { MovieCacheItem, PaginationInfo } from '@/lib/api/movies/movies';
import { getSavedFilter, saveFilter } from '@/lib/api/filters/filters';
import { useToast } from '@/hooks/useToast';
import { DEFAULT_SORT, DEFAULT_RELEASE_TYPE } from '@/constants';
import type { FilterConditions } from '@/schema/filters';
import type { DateRange } from '@/features/movies/types';

/**
 * useMovieListフックのオプション
 */
export interface UseMovieListOptions {
  /** 時間枠 */
  timeFrame: 'upcoming' | 'now_showing';
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
export function useMovieList(
  options: UseMovieListOptions,
): UseMovieListReturn {
  const { timeFrame, defaultSortOrder, defaultDateRange } = options;

  const [movies, setMovies] = useState<MovieCacheItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string>(DEFAULT_SORT);
  const [releaseType, setReleaseType] = useState<'theatrical' | 'streaming'>(
    DEFAULT_RELEASE_TYPE,
  );
  const [genres, setGenres] = useState<Record<number, string>>({});
  const [selectedGenreIds, setSelectedGenreIds] = useState<number[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange);
  const [isRevivalFilter, setIsRevivalFilter] = useState<boolean | undefined>(
    undefined,
  );
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const { toast } = useToast();
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && !!session?.user;
  const savedFilterLoaded = useRef(false);
  const initialFetchDone = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchMovies = useCallback(
    async (
      currentPage: number,
      currentSortBy: string,
      currentReleaseType: 'theatrical' | 'streaming',
      currentGenreIds: number[],
      currentDateRange: DateRange,
      currentIsRevival: boolean | undefined,
    ) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      try {
        const response = await getMovies(
          {
            page: currentPage,
            sort_by: currentSortBy as
              | 'release_date'
              | 'popularity'
              | 'vote_average',
            sort_order: defaultSortOrder,
            release_type: currentReleaseType,
            time_frame: timeFrame,
            genre_ids:
              currentGenreIds.length > 0
                ? currentGenreIds.join(',')
                : undefined,
            release_date_gte: currentDateRange.gte || undefined,
            release_date_lte: currentDateRange.lte || undefined,
            is_revival: currentIsRevival,
          },
          { signal: controller.signal },
        );
        setMovies(response.data.movies);
        setPagination(response.data.pagination);
        setGenres(response.data.genres);
      } catch (error) {
        if (controller.signal.aborted) return;
        toast({
          title: 'エラー',
          description: '映画データの取得に失敗しました。',
          variant: 'error',
        });
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [toast, timeFrame, defaultSortOrder],
  );

  // 初回マウント時に保存済みフィルターを読み込み
  useEffect(() => {
    if (status === 'loading' || savedFilterLoaded.current) return;
    savedFilterLoaded.current = true;

    if (!isAuthenticated) {
      initialFetchDone.current = true;
      return;
    }

    (async () => {
      try {
        const conditions = await getSavedFilter();
        const hasConditions = Object.keys(conditions).length > 0;

        if (hasConditions) {
          const newSortBy = conditions.sort_by || DEFAULT_SORT;
          const newReleaseType =
            conditions.release_type || DEFAULT_RELEASE_TYPE;
          const newGenreIds = conditions.genre_ids || [];
          const newDateRange: DateRange = {
            gte: conditions.date_range_gte || defaultDateRange.gte,
            lte: conditions.date_range_lte || defaultDateRange.lte,
          };
          const newIsRevival = conditions.is_revival;

          setSortBy(newSortBy);
          setReleaseType(newReleaseType);
          setSelectedGenreIds(newGenreIds);
          setDateRange(newDateRange);
          setIsRevivalFilter(newIsRevival);
          // state変更がuseEffectを再トリガーするのでfetchMoviesは呼ばない
          initialFetchDone.current = true;
        } else {
          initialFetchDone.current = true;
          fetchMovies(
            1,
            DEFAULT_SORT,
            DEFAULT_RELEASE_TYPE,
            [],
            defaultDateRange,
            undefined,
          );
        }
      } catch {
        initialFetchDone.current = true;
        fetchMovies(
          1,
          DEFAULT_SORT,
          DEFAULT_RELEASE_TYPE,
          [],
          defaultDateRange,
          undefined,
        );
      }
    })();
  }, [status, isAuthenticated, fetchMovies, defaultDateRange]);

  // state変更時の映画再取得（初回読み込み後のみ）
  useEffect(() => {
    if (!initialFetchDone.current) return;

    fetchMovies(
      page,
      sortBy,
      releaseType,
      selectedGenreIds,
      dateRange,
      isRevivalFilter,
    );
  }, [
    page,
    sortBy,
    releaseType,
    selectedGenreIds,
    dateRange,
    isRevivalFilter,
    fetchMovies,
  ]);

  const saveFilterIfAuthenticated = useCallback(
    (conditions: FilterConditions) => {
      if (!isAuthenticated) return;
      saveFilter(conditions).catch(() => {
        // fire-and-forget: 保存失敗は無視
      });
    },
    [isAuthenticated],
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
