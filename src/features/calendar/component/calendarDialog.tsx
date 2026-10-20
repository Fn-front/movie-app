/**
 * CalendarDialogコンポーネント
 * ウォッチリストの映画をカレンダー表示
 */

'use client';

import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateClickArg } from '@fullcalendar/interaction';
import type {
  DayCellMountArg,
  DatesSetArg,
  EventClickArg,
  EventContentArg,
  MoreLinkMountArg,
} from '@fullcalendar/core';
import jaLocale from '@fullcalendar/core/locales/ja';
import { IoChevronBack, IoChevronForward } from 'react-icons/io5';

import { Modal, ModalBody } from '@/components/ui/modal/modal';
import { CALENDAR_DAY_CELL_CLASSES, CALENDAR_MAX_EVENTS } from '@/constants';
import { useCalendar, formatDate } from '@/features/calendar/hooks/useCalendar';

import { CalendarEventChip } from './calendarEventChip';
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
 *
 * FullCalendar 側が既にフォーカス可能な要素で包むため、チップ自体には
 * role や tabIndex を付けない。
 */
const renderEventContent = (eventInfo: EventContentArg) => (
  <CalendarEventChip
    title={eventInfo.event.title}
    posterPath={
      (eventInfo.event.extendedProps.posterPath as string | null) ?? null
    }
  />
);

/**
 * CalendarDialogコンポーネント
 */
export const CalendarDialog = memo<CalendarDialogProps>(
  function CalendarDialog({ open, onOpenChange, onMovieClick }) {
    const {
      currentMonth,
      selectedDate,
      selectedDateKey,
      selectedDateMovies,
      monthMovies,
      moviesByDate,
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

    const handleToday = useCallback(() => {
      calendarApiRef.current?.getApi().today();
    }, []);

    const datesWithMoviesSet = useMemo(
      () => new Set(Object.keys(moviesByDate)),
      [moviesByDate],
    );

    // クラス付与は描画のたびに評価される dayCellClassNames に寄せる。
    // dayCellDidMount での classList 操作はマウント時しか走らず、
    // データが後から届いたときに取りこぼす。
    const handleDayCellClassNames = useCallback(
      (arg: { date: Date }) => {
        const dateStr = formatDate(arg.date);
        const classNames: string[] = [];

        if (datesWithMoviesSet.has(dateStr)) {
          classNames.push(CALENDAR_DAY_CELL_CLASSES.HAS_EVENTS);
        }
        if (selectedDateKey === dateStr) {
          classNames.push(CALENDAR_DAY_CELL_CLASSES.SELECTED);
        }

        return classNames;
      },
      [datesWithMoviesSet, selectedDateKey],
    );

    // FullCalendar は日セル（gridcell）の名前を aria-labelledby で日付だけに固定する。
    // セル内には作品名が並ぶため「可視テキストが名前に含まれない」状態になり、
    // axe が label-content-name-mismatch（serious）を出す。
    // 外して内容から名前を取らせると、日付（日付リンクの aria-label 由来）に加えて
    // その日の作品名も読まれるようになり、情報量の面でも有利。
    const handleDayCellDidMount = useCallback((arg: DayCellMountArg) => {
      arg.el.removeAttribute('aria-labelledby');
    }, []);

    // FullCalendar 6.1 は href も role も持たない <a> に aria-expanded を付ける。
    // generic ロールでは許可されない属性なので（axe: aria-allowed-attr / critical）、
    // ポップオーバーを開くという実態どおり role=button を補う。
    const handleMoreLinkDidMount = useCallback((arg: MoreLinkMountArg) => {
      arg.el.setAttribute('role', 'button');
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
            <div className={styles.c_calendarDialog__layout}>
              <div className={styles.c_calendarDialog__calendar}>
                <div className={styles.c_calendarDialog__header}>
                  <div className={styles.c_calendarDialog__nav}>
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
                  <button
                    type='button'
                    className={styles.c_calendarDialog__todayButton}
                    onClick={handleToday}
                  >
                    今日
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
                  moreLinkDidMount={handleMoreLinkDidMount}
                  dayCellClassNames={handleDayCellClassNames}
                  dayCellDidMount={handleDayCellDidMount}
                  headerToolbar={false}
                  height='auto'
                  dayMaxEvents={CALENDAR_MAX_EVENTS}
                  fixedWeekCount={false}
                />
              </div>
              <div className={styles.c_calendarDialog__panel}>
                <CalendarMovieList
                  movies={selectedDate ? selectedDateMovies : monthMovies}
                  currentMonth={currentMonth}
                  selectedDate={selectedDate}
                  onMovieClick={handleMovieClick}
                />
              </div>
            </div>
          )}
        </ModalBody>
      </Modal>
    );
  },
);

CalendarDialog.displayName = 'CalendarDialog';
