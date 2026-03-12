/**
 * CalendarButtonコンポーネント
 * サイドバーのカレンダーボタン + CalendarDialog + 映画詳細モーダル
 */

'use client';

import { memo, useState, useCallback } from 'react';
import { FiCalendar } from 'react-icons/fi';

import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';

import { CalendarDialog } from './calendarDialog';
import styles from './calendarButton.module.scss';

/**
 * CalendarButtonコンポーネント
 */
export const CalendarButton = memo(function CalendarButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  const handleMovieClick = useCallback((tmdbMovieId: number) => {
    setIsOpen(false);
    setSelectedMovieId(tmdbMovieId);
  }, []);

  const handleModalClose = useCallback(() => {
    setSelectedMovieId(null);
  }, []);

  return (
    <>
      <button
        type='button'
        className={styles.c_calendarButton}
        onClick={handleOpen}
        aria-label='公開カレンダーを開く'
      >
        <FiCalendar
          className={styles.c_calendarButton__icon}
          aria-hidden='true'
        />
        <span className={styles.c_calendarButton__text}>公開カレンダー</span>
      </button>
      <CalendarDialog
        open={isOpen}
        onOpenChange={handleOpenChange}
        onMovieClick={handleMovieClick}
      />
      <MovieDetailModal movieId={selectedMovieId} onClose={handleModalClose} />
    </>
  );
});

CalendarButton.displayName = 'CalendarButton';
