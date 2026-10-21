/**
 * CalendarEventChipコンポーネント
 * 月グリッドのセル内に表示する1作品ぶんのチップ
 */

'use client';

import { memo } from 'react';
import Image from 'next/image';

import { API, TMDB_IMAGE_SIZES, IMAGE_SIZES } from '@/constants';

import styles from './calendarEventChip.module.scss';

/**
 * CalendarEventChipコンポーネントのプロパティ
 */
export interface CalendarEventChipProps {
  /** 映画タイトル */
  title: string;
  /** ポスター画像パス */
  posterPath: string | null;
}

/**
 * CalendarEventChipコンポーネント
 *
 * ポスターはタイトルの隣に並ぶ装飾なので alt は空にする。
 * 読み上げはチップを包む FullCalendar のイベント要素側に任せる。
 */
export const CalendarEventChip = memo<CalendarEventChipProps>(
  function CalendarEventChip({ title, posterPath }) {
    return (
      <span className={styles.c_calendarEventChip}>
        {posterPath && (
          <Image
            src={`${API.TMDB_IMAGE_BASE_URL}/${TMDB_IMAGE_SIZES.POSTER.SMALL}${posterPath}`}
            alt=''
            width={IMAGE_SIZES.CALENDAR_CHIP_POSTER.WIDTH}
            height={IMAGE_SIZES.CALENDAR_CHIP_POSTER.HEIGHT}
            className={styles.c_calendarEventChip__poster}
          />
        )}
        <span className={styles.c_calendarEventChip__title}>{title}</span>
      </span>
    );
  },
);

CalendarEventChip.displayName = 'CalendarEventChip';
