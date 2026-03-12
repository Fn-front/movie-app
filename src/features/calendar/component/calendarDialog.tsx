/**
 * CalendarDialogコンポーネント
 * ウォッチリストの映画をカレンダー表示
 */

'use client';

import { memo, useCallback, useEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { ja } from 'react-day-picker/locale';

import { Modal, ModalBody } from '@/components/ui/modal/modal';
import { useCalendar } from '@/features/calendar/hooks/useCalendar';

import { CalendarMovieList } from './calendarMovieList';
import styles from './calendarDialog.module.scss';

/**
 * CalendarDialogコンポーネントのプロパティ
 */
export interface CalendarDialogProps {
  /** ダイアログの開閉状態 */
  open: boolean;
  /** ダイアログを閉じる時のコールバック */
  onOpenChange: (open: boolean) => void;
  /** 映画クリック時のコールバック */
  onMovieClick?: (tmdbMovieId: number) => void;
}

/**
 * CalendarDialogコンポーネント
 */
export const CalendarDialog = memo<CalendarDialogProps>(
  function CalendarDialog({ open, onOpenChange, onMovieClick }) {
    const {
      currentMonth,
      selectedDate,
      selectedDateMovies,
      datesWithMovies,
      goToPreviousMonth,
      goToNextMonth,
      selectDate,
      resetCache,
      isLoading,
      error,
    } = useCalendar();

    // ダイアログを開いた時にキャッシュをクリア
    useEffect(() => {
      if (open) {
        resetCache();
      }
    }, [open, resetCache]);

    const handleMonthChange = useCallback(
      (month: Date) => {
        const current = new Date(currentMonth);
        if (month.getTime() > current.getTime()) {
          goToNextMonth();
        } else {
          goToPreviousMonth();
        }
      },
      [currentMonth, goToNextMonth, goToPreviousMonth],
    );

    const handleDayClick = useCallback(
      (date: Date) => {
        selectDate(date);
      },
      [selectDate],
    );

    const handleMovieClick = useCallback(
      (tmdbMovieId: number) => {
        onMovieClick?.(tmdbMovieId);
      },
      [onMovieClick],
    );

    return (
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title='公開カレンダー'
        description='ウォッチリストの映画を公開日ごとに表示します'
        size='lg'
      >
        <ModalBody className={styles.c_calendarDialog__body}>
          {isLoading ? (
            <div className={styles.c_calendarDialog__loading}>
              <span>読み込み中...</span>
            </div>
          ) : error ? (
            <div className={styles.c_calendarDialog__error}>
              <span>データの取得に失敗しました</span>
            </div>
          ) : (
            <>
              <div className={styles.c_calendarDialog__calendar}>
                <DayPicker
                  locale={ja}
                  month={currentMonth}
                  onMonthChange={handleMonthChange}
                  mode='single'
                  selected={selectedDate}
                  onSelect={selectDate}
                  onDayClick={handleDayClick}
                  modifiers={{ hasMovies: datesWithMovies }}
                  modifiersClassNames={{
                    hasMovies: styles.c_calendarDialog__dayWithMovies,
                  }}
                  classNames={{
                    root: styles.c_calendarDialog__dayPicker,
                    month_caption: styles.c_calendarDialog__caption,
                    nav: styles.c_calendarDialog__nav,
                    button_previous: styles.c_calendarDialog__navButton,
                    button_next: styles.c_calendarDialog__navButton,
                    weekday: styles.c_calendarDialog__weekday,
                    day: styles.c_calendarDialog__day,
                    selected: styles.c_calendarDialog__daySelected,
                    today: styles.c_calendarDialog__dayToday,
                    outside: styles.c_calendarDialog__dayOutside,
                  }}
                />
              </div>
              {selectedDate && (
                <CalendarMovieList
                  movies={selectedDateMovies}
                  selectedDate={selectedDate}
                  onMovieClick={handleMovieClick}
                />
              )}
            </>
          )}
        </ModalBody>
      </Modal>
    );
  },
);

CalendarDialog.displayName = 'CalendarDialog';
