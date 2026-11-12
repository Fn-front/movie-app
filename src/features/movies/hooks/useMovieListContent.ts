/**
 * MovieListContentコンポーネント用カスタムフック
 * タブ切り替え・フィルターモーダルのロジックを管理
 *
 * 映画詳細は `/movies/[id]` というURLを持つルートになったため、
 * 選択中の映画をここで持つ必要が無くなった（#1033）。
 */

import { useCallback } from 'react';

export interface UseMovieListContentReturn {
  handleTabValueChange: (value: string) => void;
  handleFilterModalOpenChange: (open: boolean) => void;
}

export function useMovieListContent(
  handleReleaseTypeChange: (value: 'theatrical' | 'streaming') => void,
  handleFilterModalClose: () => void,
): UseMovieListContentReturn {
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
    handleTabValueChange,
    handleFilterModalOpenChange,
  };
}
