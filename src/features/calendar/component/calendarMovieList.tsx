/**
 * CalendarMovieListコンポーネント
 * 選択日の映画一覧を表示
 */

'use client';

import { memo, useCallback } from 'react';
import Image from 'next/image';
import { IoChevronForward } from 'react-icons/io5';

import { API, TMDB_IMAGE_SIZES, IMAGE_SIZES } from '@/constants';
import type { CalendarMovieItem } from '@/lib/api/calendar/calendar';

import styles from './calendarMovieList.module.scss';

/**
 * CalendarMovieListコンポーネントのプロパティ
 */
export interface CalendarMovieListProps {
  /** 映画一覧 */
  movies: CalendarMovieItem[];
  /** 選択日 */
  selectedDate: Date;
  /** 映画クリック時のコールバック */
  onMovieClick?: (tmdbMovieId: number) => void;
}

/**
 * CalendarMovieListコンポーネント
 */
export const CalendarMovieList = memo<CalendarMovieListProps>(
  function CalendarMovieList({ movies, selectedDate, onMovieClick }) {
    const handleMovieClick = useCallback(
      (tmdbMovieId: number) => {
        onMovieClick?.(tmdbMovieId);
      },
      [onMovieClick],
    );

    const formattedDate = `${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日`;

    if (movies.length === 0) {
      return (
        <div className={styles.c_calendarMovieList}>
          <h3 className={styles.c_calendarMovieList__title}>{formattedDate}</h3>
          <p className={styles.c_calendarMovieList__empty}>
            この日に公開予定の映画はありません
          </p>
        </div>
      );
    }

    return (
      <div className={styles.c_calendarMovieList}>
        <h3 className={styles.c_calendarMovieList__title}>
          {formattedDate}（{movies.length}件）
        </h3>
        <ul className={styles.c_calendarMovieList__list} role='list'>
          {movies.map((movie) => (
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
                  <span className={styles.c_calendarMovieList__releaseDate}>
                    {movie.release_date}
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
