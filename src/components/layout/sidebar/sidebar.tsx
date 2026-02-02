/**
 * Sidebarコンポーネント
 */

'use client';

import { type HTMLAttributes, type ReactNode, memo } from 'react';

import styles from './sidebar.module.scss';

/**
 * Sidebarコンポーネントのプロパティ
 */
export interface SidebarProps extends HTMLAttributes<HTMLElement> {
  /** ユーザーセクション */
  userSection?: ReactNode;
  /** カレンダーボタン */
  calendarButton?: ReactNode;
  /** ウォッチリスト */
  watchlist?: ReactNode;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * Sidebarコンポーネント
 *
 * @example
 * ```tsx
 * <Sidebar
 *   userSection={<UserProfile user={user} />}
 *   calendarButton={<Button onClick={handleOpenCalendar}>カレンダー</Button>}
 *   watchlist={<WatchlistItems items={watchlistItems} />}
 * />
 * ```
 */
export const Sidebar = memo<SidebarProps>(function Sidebar({
  userSection,
  calendarButton,
  watchlist,
  className,
  ...props
}) {
  const classNames = [styles.c_sidebar, className].filter(Boolean).join(' ');

  return (
    <aside className={classNames} {...props}>
      {userSection && <div className={styles.c_sidebar__user}>{userSection}</div>}

      {calendarButton && <div className={styles.c_sidebar__calendar}>{calendarButton}</div>}

      {watchlist && (
        <div className={styles.c_sidebar__watchlist}>
          <h2 className={styles.c_sidebar__watchlist_title}>見たい映画</h2>
          {watchlist}
        </div>
      )}
    </aside>
  );
});

Sidebar.displayName = 'Sidebar';
