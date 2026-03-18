/**
 * MovieDetailModalコンポーネント
 * 映画詳細をモーダルで表示
 */

'use client';

import { memo, useCallback, useState } from 'react';

import { Modal } from '@/components/ui/modal/modal';
import { MovieDetailContent } from '@/features/movies/component/movieDetailContent/movieDetailContent';
import { MODAL_TITLES } from '@/constants';
import { cn } from '@/utils/cn';

import styles from './movieDetailModal.module.scss';

/**
 * MovieDetailModalコンポーネントのプロパティ
 */
export interface MovieDetailModalProps {
  /** 表示する映画ID（nullの場合はモーダル非表示） */
  movieId: number | null;
  /** モーダルタイトル（映画タイトルを表示） */
  title?: string;
  /** 予算・興行収入を表示するか */
  showFinancialInfo?: boolean;
  /** モーダルを閉じるコールバック */
  onClose: () => void;
}

/**
 * MovieDetailModalコンポーネント
 */
export const MovieDetailModal = memo<MovieDetailModalProps>(
  function MovieDetailModal({ movieId, title, showFinancialInfo, onClose }) {
    const [isVideoDialogOpen, setIsVideoDialogOpen] = useState(false);

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
        title={title ?? MODAL_TITLES.MOVIE_DETAIL}
        size='lg'
        className={cn(isVideoDialogOpen && styles.c_movie_detail_modal__dimmed)}
      >
        {movieId !== null && (
          <MovieDetailContent
            movieId={movieId}
            showFinancialInfo={showFinancialInfo}
            onVideoDialogOpenChange={setIsVideoDialogOpen}
          />
        )}
      </Modal>
    );
  },
);

MovieDetailModal.displayName = 'MovieDetailModal';
