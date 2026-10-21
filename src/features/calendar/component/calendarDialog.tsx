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
 * 拡大の完了を待つ上限フレーム数。
 * 出現アニメーションは200ms（約12フレーム）なので十分な余裕を取る。
 */
const SETTLE_MAX_FRAMES = 40;

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

    // モーダルの出現アニメーションは scale(0.96) から始まる（modal.module.scss の contentShow）。
    // FullCalendar は幅を getBoundingClientRect() で測る（internal-common.js の
    // computeScrollerDims）が、この値は transform 適用後なので拡大途中では「実幅 × 0.96」に
    // なる。測った幅はテーブルのインライン width に焼き込まれ、拡大完了後も再計算されないため、
    // 土曜カラムの右に余白が残る。
    //
    // useEffect で待つと、open が true になった時点では Radix の Portal 内がまだ
    // マウントされておらず要素を掴めない。要素のマウントそのものを起点にする。
    //
    // 拡大の完了は offsetWidth（レイアウト幅・transform の影響を受けない）と
    // getBoundingClientRect().width（transform 込み）の一致で判定する。
    // 「幅が変化しなくなったら完了」とすると、アニメーション開始前の
    // 縮んだままの状態を完了と誤判定する。
    const handleCalendarRef = useCallback((node: HTMLDivElement | null) => {
      if (!node) return;

      let frameId = 0;
      let remainingFrames = SETTLE_MAX_FRAMES;

      const settle = () => {
        // 拡大中は transform 込みの幅がレイアウト幅より必ず小さい。
        // 0.99 倍のような「ほぼ等倍」で妥協すると、FullCalendar の Math.floor で
        // 1px 足りない幅が焼き込まれるため、等倍になるまで待つ
        const isUnscaled =
          node.getBoundingClientRect().width >= node.offsetWidth;

        if (isUnscaled || remainingFrames <= 0) {
          calendarApiRef.current?.getApi().updateSize();
          return;
        }

        remainingFrames -= 1;
        frameId = requestAnimationFrame(settle);
      };

      frameId = requestAnimationFrame(settle);
      return () => cancelAnimationFrame(frameId);
    }, []);

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
    // 外して内容から名前を取らせると、日付（日付リンクの aria-label 由来）に加えて
    // その日の作品名も読まれるようになり、読み上げの情報量が増える。
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
              <div
                className={styles.c_calendarDialog__calendar}
                ref={handleCalendarRef}
              >
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
