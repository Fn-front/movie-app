/**
 * CalendarMovieListコンポーネント
 * 選択日、または表示中の月の映画一覧を表示
 */

'use client';

import { memo, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { IoChevronForward } from 'react-icons/io5';

import {
  API,
  TMDB_IMAGE_SIZES,
  IMAGE_SIZES,
  EMPTY_MESSAGES,
  DATE_FORMATS,
  CALENDAR_HEADINGS,
} from '@/constants';
import { formatDate } from '@/utils/date';
import type { CalendarMovieItem } from '@/lib/api/calendar/calendar';

import { formatReleaseProximity } from '../utils/releaseProximity';
import styles from './calendarMovieList.module.scss';

/**
 * CalendarMovieListコンポーネントのプロパティ
 */
export interface CalendarMovieListProps {
  /** 映画一覧 */
  movies: CalendarMovieItem[];
  /** 表示中の月 */
  currentMonth: Date;
  /** 選択日。未指定なら月全体のアジェンダとして表示する */
  selectedDate?: Date;
  /** 映画クリック時のコールバック */
  onMovieClick?: (tmdbMovieId: number) => void;
}

/**
 * CalendarMovieListコンポーネント
 *
 * 日付が選ばれていないときも空にせず、その月の公開予定をまとめて出す。
 * 「クリックするまで何も出ない」状態を避けるため。
 */
export const CalendarMovieList = memo<CalendarMovieListProps>(
  function CalendarMovieList({
    movies,
    currentMonth,
    selectedDate,
    onMovieClick,
  }) {
    const handleMovieClick = useCallback(
      (tmdbMovieId: number) => {
        onMovieClick?.(tmdbMovieId);
      },
      [onMovieClick],
    );

    // 選択日モードでは日付が見出しに出るため、行側では省略する
    const isDayMode = selectedDate !== undefined;

    const headingDate = useMemo(
      () =>
        selectedDate
          ? (formatDate(selectedDate, DATE_FORMATS.MONTH_DAY_WEEKDAY) ?? '')
          : (formatDate(currentMonth, DATE_FORMATS.MONTH) ?? ''),
      [selectedDate, currentMonth],
    );

    const heading = useMemo(() => {
      if (movies.length === 0) {
        return isDayMode ? headingDate : null;
      }
      return isDayMode
        ? CALENDAR_HEADINGS.selectedDate(headingDate, movies.length)
        : CALENDAR_HEADINGS.month(headingDate, movies.length);
    }, [isDayMode, headingDate, movies.length]);

    const rows = useMemo(() => {
      const today = new Date();
      return movies.map((movie) => ({
        movie,
        releaseLabel: isDayMode
          ? null
          : formatDate(movie.release_date, DATE_FORMATS.MONTH_DAY_WEEKDAY),
        proximityLabel: formatReleaseProximity(movie.release_date, today),
      }));
    }, [movies, isDayMode]);

    if (movies.length === 0) {
      return (
        <div className={styles.c_calendarMovieList}>
          {heading && (
            <h3 className={styles.c_calendarMovieList__title}>{heading}</h3>
          )}
          <p className={styles.c_calendarMovieList__empty}>
            {isDayMode ? EMPTY_MESSAGES.CALENDAR : EMPTY_MESSAGES.CALENDAR_MONTH}
          </p>
        </div>
      );
    }

    return (
      <div className={styles.c_calendarMovieList}>
        <h3 className={styles.c_calendarMovieList__title}>{heading}</h3>
        <ul className={styles.c_calendarMovieList__list} role='list'>
          {rows.map(({ movie, releaseLabel, proximityLabel }) => (
            <li key={movie.id} className={styles.c_calendarMovieList__item}>
              <button
                type='button'
                className={styles.c_calendarMovieList__button}
                onClick={() => handleMovieClick(movie.tmdb_movie_id)}
                aria-label={movie.title}
              >
                <div className={styles.c_calendarMovieList__poster}>
                  {movie.poster_path ? (
                    <Image
                      src={`${API.TMDB_IMAGE_BASE_URL}/${TMDB_IMAGE_SIZES.POSTER.SMALL}${movie.poster_path}`}
                      alt={movie.title}
                      width={IMAGE_SIZES.CALENDAR_POSTER.WIDTH}
                      height={IMAGE_SIZES.CALENDAR_POSTER.HEIGHT}
                      className={styles.c_calendarMovieList__posterImage}
                    />
                  ) : (
                    <div className={styles.c_calendarMovieList__posterFallback}>
                      <span>No Image</span>
                    </div>
                  )}
                </div>
                <div className={styles.c_calendarMovieList__info}>
                  <span className={styles.c_calendarMovieList__movieTitle}>
                    {movie.title}
                  </span>
                  <span className={styles.c_calendarMovieList__meta}>
                    {releaseLabel && (
                      <span className={styles.c_calendarMovieList__releaseDate}>
                        {releaseLabel}
                      </span>
                    )}
                    {proximityLabel && (
                      <span className={styles.c_calendarMovieList__proximity}>
                        {proximityLabel}
                      </span>
                    )}
                  </span>
                </div>
                <IoChevronForward
                  className={styles.c_calendarMovieList__arrow}
                  aria-hidden='true'
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  },
);

CalendarMovieList.displayName = 'CalendarMovieList';
