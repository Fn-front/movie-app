/**
 * CalendarDialogコンポーネント
 * ウォッチリストの映画をカレンダー表示
 */

'use client';

import { memo, useCallback, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateClickArg } from '@fullcalendar/interaction';
import type {
  DatesSetArg,
  EventClickArg,
  EventContentArg,
} from '@fullcalendar/core';
import jaLocale from '@fullcalendar/core/locales/ja';
import { IoChevronBack, IoChevronForward } from 'react-icons/io5';

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
 * イベントのカスタムレンダリング
 */
const renderEventContent = (eventInfo: EventContentArg) => {
  return (
    <span className={styles.c_calendarDialog__event}>
      {eventInfo.event.title}
    </span>
  );
};

/**
 * CalendarDialogコンポーネント
 */
export const CalendarDialog = memo<CalendarDialogProps>(
  function CalendarDialog({ open, onOpenChange, onMovieClick }) {
    const {
      currentMonth,
      selectedDate,
      selectedDateMovies,
      calendarEvents,
      selectDate,
      handleDatesSet,
      resetCache,
      isLoading,
      error,
    } = useCalendar();

    const calendarApiRef = useRef<FullCalendar>(null);

    // ダイアログを開いた時にキャッシュをクリア
    useEffect(() => {
      if (open) {
        resetCache();
      }
    }, [open, resetCache]);

    const handlePrev = useCallback(() => {
      calendarApiRef.current?.getApi().prev();
    }, []);

    const handleNext = useCallback(() => {
      calendarApiRef.current?.getApi().next();
    }, []);

    const handleDateClick = useCallback(
      (arg: DateClickArg) => {
        selectDate(arg.date);
      },
      [selectDate],
    );

    const handleEventClick = useCallback(
      (arg: EventClickArg) => {
        if (!arg.event.start) return;
        selectDate(arg.event.start);
      },
      [selectDate],
    );

    const handleDatesSetCallback = useCallback(
      (arg: DatesSetArg) => {
        handleDatesSet({ currentStart: arg.view.currentStart });
      },
      [handleDatesSet],
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
        size='xl'
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
                <div className={styles.c_calendarDialog__header}>
                  <button
                    type='button'
                    className={styles.c_calendarDialog__navButton}
                    onClick={handlePrev}
                    aria-label='前月'
                  >
                    <IoChevronBack />
                  </button>
                  <span className={styles.c_calendarDialog__title}>
                    {currentMonth.toLocaleDateString('ja-JP', {
                      year: 'numeric',
                      month: 'long',
                    })}
                  </span>
                  <button
                    type='button'
                    className={styles.c_calendarDialog__navButton}
                    onClick={handleNext}
                    aria-label='次月'
                  >
                    <IoChevronForward />
                  </button>
                </div>
                <FullCalendar
                  ref={calendarApiRef}
                  plugins={[dayGridPlugin, interactionPlugin]}
                  initialView='dayGridMonth'
                  locale={jaLocale}
                  initialDate={currentMonth}
                  events={calendarEvents}
                  dateClick={handleDateClick}
                  datesSet={handleDatesSetCallback}
                  eventContent={renderEventContent}
                  eventClick={handleEventClick}
                  headerToolbar={false}
                  height='auto'
                  dayMaxEvents={3}
                  fixedWeekCount={false}
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
