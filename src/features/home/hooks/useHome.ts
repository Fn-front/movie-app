/**
 * Homeのカスタムフック
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';

import { getMovies } from '@/lib/api/movies/movies';
import type { MovieCacheItem, PaginationInfo } from '@/lib/api/movies/movies';
import { getSavedFilter, saveFilter } from '@/lib/api/filters/filters';
import { useToast } from '@/hooks/useToast';
import { DEFAULT_SORT, DEFAULT_RELEASE_TYPE } from '@/constants';
import type { FilterConditions } from '@/schema/filters';

/**
 * 日付範囲フィルタの型
 */
export interface DateRange {
  gte?: string;
  lte?: string;
}

/**
 * useHomeフックの返り値
 */
export interface UseHomeReturn {
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
  /** リリースタイプ */
  releaseType: 'theatrical' | 'streaming';
  /** ジャンルマップ */
  genres: Record<number, string>;
  /** 選択中のジャンルID */
  selectedGenreIds: number[];
  /** 日付範囲フィルタ */
  dateRange: DateRange;
  /** リバイバルフィルタ */
  isRevivalFilter: boolean | undefined;
  /** フィルターモーダル開閉状態 */
  isFilterModalOpen: boolean;
  /** ページ変更 */
  handlePageChange: (page: number) => void;
  /** ソート変更 */
  handleSortChange: (value: string) => void;
  /** リリースタイプ変更 */
  handleReleaseTypeChange: (value: 'theatrical' | 'streaming') => void;
  /** フィルター適用（ジャンル + 日付 + リバイバル） */
  handleFilterApply: (
    genreIds: number[],
    dateRange: DateRange,
    isRevival: boolean | undefined,
  ) => void;
  /** フィルターモーダルを開く */
  handleFilterModalOpen: () => void;
  /** フィルターモーダルを閉じる */
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
 * Homeのカスタムフック
 */
export function useHome(): UseHomeReturn {
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
  const [dateRange, setDateRange] = useState<DateRange>({});
  const [isRevivalFilter, setIsRevivalFilter] = useState<boolean | undefined>(
    undefined,
  );
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const { toast } = useToast();
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && !!session?.user;
  const savedFilterLoaded = useRef(false);
  const initialFetchDone = useRef(false);

  const fetchMovies = useCallback(
    async (
      currentPage: number,
      currentSortBy: string,
      currentReleaseType: 'theatrical' | 'streaming',
      currentGenreIds: number[],
      currentDateRange: DateRange,
      currentIsRevival: boolean | undefined,
    ) => {
      setIsLoading(true);
      try {
        const response = await getMovies({
          page: currentPage,
          sort_by: currentSortBy as
            | 'release_date'
            | 'popularity'
            | 'vote_average',
          release_type: currentReleaseType,
          genre_ids:
            currentGenreIds.length > 0 ? currentGenreIds.join(',') : undefined,
          release_date_gte: currentDateRange.gte || undefined,
          release_date_lte: currentDateRange.lte || undefined,
          is_revival: currentIsRevival,
        });
        setMovies(response.data.movies);
        setPagination(response.data.pagination);
        setGenres(response.data.genres);
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

  // 初回マウント時に保存済みフィルターを読み込み
  useEffect(() => {
    if (status === 'loading' || savedFilterLoaded.current) return;
    savedFilterLoaded.current = true;

    if (!isAuthenticated) {
      // 未ログイン: デフォルトで映画取得
      initialFetchDone.current = true;
      fetchMovies(1, DEFAULT_SORT, DEFAULT_RELEASE_TYPE, [], {}, undefined);
      return;
    }

    // ログイン済み: 保存フィルターを取得して適用
    (async () => {
      try {
        const conditions = await getSavedFilter();
        const hasConditions = Object.keys(conditions).length > 0;

        if (hasConditions) {
          const newSortBy = conditions.sort_by || DEFAULT_SORT;
          const newReleaseType = conditions.release_type || DEFAULT_RELEASE_TYPE;
          const newGenreIds = conditions.genre_ids || [];
          const newDateRange: DateRange = {
            gte: conditions.date_range_gte,
            lte: conditions.date_range_lte,
          };
          const newIsRevival = conditions.is_revival;

          setSortBy(newSortBy);
          setReleaseType(newReleaseType);
          setSelectedGenreIds(newGenreIds);
          setDateRange(newDateRange);
          setIsRevivalFilter(newIsRevival);

          initialFetchDone.current = true;
          fetchMovies(
            1,
            newSortBy,
            newReleaseType,
            newGenreIds,
            newDateRange,
            newIsRevival,
          );
        } else {
          initialFetchDone.current = true;
          fetchMovies(
            1,
            DEFAULT_SORT,
            DEFAULT_RELEASE_TYPE,
            [],
            {},
            undefined,
          );
        }
      } catch {
        // フィルター取得失敗時はデフォルトで映画取得
        initialFetchDone.current = true;
        fetchMovies(1, DEFAULT_SORT, DEFAULT_RELEASE_TYPE, [], {}, undefined);
      }
    })();
  }, [status, isAuthenticated, fetchMovies]);

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

  /**
   * フィルター条件をfire-and-forgetで保存
   */
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
    [sortBy, selectedGenreIds, dateRange, isRevivalFilter, saveFilterIfAuthenticated],
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
