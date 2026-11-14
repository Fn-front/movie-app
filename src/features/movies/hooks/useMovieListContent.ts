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
  handleFilterModalOpen: () => void,
): UseMovieListContentReturn {
  const handleTabValueChange = useCallback(
    (value: string) => {
      handleReleaseTypeChange(value as 'theatrical' | 'streaming');
    },
    [handleReleaseTypeChange],
  );

  /*
    ⚠️ **open === true も受けること**（#1053）。

    以前は閉じる方向しか扱っていなかった。開くのはトリガーのボタンだけ、
    という前提だったが、**進むで履歴エントリが復活したとき**にも
    Modal から true が来る。握りつぶすとエントリだけ戻って
    モーダルは閉じたままになり、次の戻るが空振りする。
  */
  const handleFilterModalOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        handleFilterModalOpen();
        return;
      }

      handleFilterModalClose();
    },
    [handleFilterModalClose, handleFilterModalOpen],
  );

  return {
    handleTabValueChange,
    handleFilterModalOpenChange,
  };
}
