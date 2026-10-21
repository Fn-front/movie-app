/**
 * CalendarButtonコンポーネント
 * サイドバーから公開カレンダーを開くトリガー
 */

'use client';

import { memo } from 'react';
import { FiCalendar } from 'react-icons/fi';

import { ARIA_LABELS, MENU_LABELS } from '@/constants';

import styles from './calendarButton.module.scss';

/**
 * CalendarButtonコンポーネントのプロパティ
 */
export interface CalendarButtonProps {
  /** クリック時のコールバック */
  onClick: () => void;
}

/**
 * CalendarButtonコンポーネント
 *
 * ダイアログ本体は持たない。トリガーはサイドバーとモバイルドロワーの2か所にあり、
 * ドロワーは開いた瞬間にアンマウントされるため、状態とダイアログは AppLayout が持つ。
 */
export const CalendarButton = memo<CalendarButtonProps>(
  function CalendarButton({ onClick }) {
    return (
      <button
        type='button'
        className={styles.c_calendarButton}
        onClick={onClick}
        aria-label={ARIA_LABELS.OPEN_CALENDAR}
      >
        <FiCalendar
          className={styles.c_calendarButton__icon}
          aria-hidden='true'
        />
        <span className={styles.c_calendarButton__text}>
          {MENU_LABELS.CALENDAR}
        </span>
      </button>
    );
  },
);

CalendarButton.displayName = 'CalendarButton';
