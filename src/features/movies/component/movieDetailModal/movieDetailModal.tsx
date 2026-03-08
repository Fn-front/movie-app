/**
 * MovieDetailModalコンポーネント
 * 映画詳細をモーダルで表示
 */

'use client';

import { memo, useCallback } from 'react';

import { Modal } from '@/components/ui/modal/modal';
import { MovieDetailContent } from '@/features/movies/component/movieDetailContent/movieDetailContent';

/**
 * MovieDetailModalコンポーネントのプロパティ
 */
export interface MovieDetailModalProps {
  /** 表示する映画ID（nullの場合はモーダル非表示） */
  movieId: number | null;
  /** 予算・興行収入を表示するか */
  showFinancialInfo?: boolean;
  /** モーダルを閉じるコールバック */
  onClose: () => void;
}

/**
 * MovieDetailModalコンポーネント
 */
export const MovieDetailModal = memo<MovieDetailModalProps>(
  function MovieDetailModal({ movieId, showFinancialInfo, onClose }) {
    const handleOpenChange = useCallback(
      (open: boolean) => {
        if (!open) {
          onClose();
        }
      },
      [onClose],
    );

    return (
      <Modal
        open={movieId !== null}
        onOpenChange={handleOpenChange}
        title='映画詳細'
        size='lg'
      >
        {movieId !== null && (
          <MovieDetailContent
            movieId={movieId}
            showFinancialInfo={showFinancialInfo}
          />
        )}
      </Modal>
    );
  },
);

MovieDetailModal.displayName = 'MovieDetailModal';
