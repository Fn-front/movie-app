/**
 * Homeのカスタムフック
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

import { getMovies } from '@/lib/api/movies/movies';
import type { MovieCacheItem, PaginationInfo } from '@/lib/api/movies/movies';
import { useToast } from '@/hooks/useToast';
import { DEFAULT_SORT, DEFAULT_RELEASE_TYPE } from '@/constants';

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

  useEffect(() => {
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

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSortChange = useCallback((value: string) => {
    setSortBy(value);
    setPage(1);
  }, []);

  const handleReleaseTypeChange = useCallback(
    (value: 'theatrical' | 'streaming') => {
      setReleaseType(value);
      setPage(1);
    },
    [],
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
    },
    [],
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
