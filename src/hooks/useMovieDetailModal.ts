/**
 * 映画詳細モーダル共通フック
 * 映画選択・モーダル表示・クローズ処理を共通化
 */

import { useCallback, useMemo, useState } from 'react';

interface MovieIdentifiable {
  id: number;
  title: string;
}

interface UseMovieDetailModalReturn {
  selectedMovieId: number | null;
  selectedMovieTitle: string | undefined;
  handleMovieClick: (movieId: number) => void;
  handleModalClose: () => void;
}

/**
 * 映画詳細モーダルの選択・表示・クローズ処理を共通化するフック
 */
export function useMovieDetailModal(
  items: readonly MovieIdentifiable[],
): UseMovieDetailModalReturn {
  const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);

  const handleMovieClick = useCallback((movieId: number) => {
    setSelectedMovieId(movieId);
  }, []);

  const handleModalClose = useCallback(() => {
    setSelectedMovieId(null);
  }, []);

  const selectedMovieTitle = useMemo(
    () => items.find((item) => item.id === selectedMovieId)?.title,
    [items, selectedMovieId],
  );

  return {
    selectedMovieId,
    selectedMovieTitle,
    handleMovieClick,
    handleModalClose,
  };
}
