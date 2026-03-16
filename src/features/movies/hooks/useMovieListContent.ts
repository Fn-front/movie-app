/**
 * MovieListContentコンポーネント用カスタムフック
 * 映画詳細モーダル・タブ切り替え・フィルターモーダルのロジックを管理
 */

import { useCallback, useMemo, useState } from 'react';

import type { MovieCacheItem } from '@/lib/api/movies/movies';

export interface UseMovieListContentReturn {
  selectedMovieId: number | null;
  showFinancialInfo: boolean;
  selectedMovieTitle: string | undefined;
  handleMovieTileClick: (movieId: number) => void;
  handleDetailModalClose: () => void;
  handleTabValueChange: (value: string) => void;
  handleFilterModalOpenChange: (open: boolean) => void;
}

export function useMovieListContent(
  movies: MovieCacheItem[],
  handleReleaseTypeChange: (value: 'theatrical' | 'streaming') => void,
  handleFilterModalClose: () => void,
): UseMovieListContentReturn {
  const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);
  const [showFinancialInfo, setShowFinancialInfo] = useState(false);

  const handleMovieTileClick = useCallback(
    (movieId: number) => {
      setSelectedMovieId(movieId);
      const movie = movies.find((m) => m.id === movieId);
      const isReleased =
        movie?.release_date !== undefined &&
        movie.release_date !== null &&
        new Date(movie.release_date) < new Date();
      setShowFinancialInfo(isReleased || movie?.is_revival === true);
    },
    [movies],
  );

  const handleDetailModalClose = useCallback(() => {
    setSelectedMovieId(null);
    setShowFinancialInfo(false);
  }, []);

  const selectedMovieTitle = useMemo(
    () => movies.find((m) => m.id === selectedMovieId)?.title,
    [movies, selectedMovieId],
  );

  const handleTabValueChange = useCallback(
    (value: string) => {
      handleReleaseTypeChange(value as 'theatrical' | 'streaming');
    },
    [handleReleaseTypeChange],
  );

  const handleFilterModalOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        handleFilterModalClose();
      }
    },
    [handleFilterModalClose],
  );

  return {
    selectedMovieId,
    showFinancialInfo,
    selectedMovieTitle,
    handleMovieTileClick,
    handleDetailModalClose,
    handleTabValueChange,
    handleFilterModalOpenChange,
  };
}
