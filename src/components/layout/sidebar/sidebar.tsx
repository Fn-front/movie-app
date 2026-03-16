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
  /** ナビゲーション */
  navigation?: ReactNode;
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
 *   navigation={<SideNav />}
 *   userSection={<UserProfile user={user} />}
 *   calendarButton={<Button onClick={handleOpenCalendar}>カレンダー</Button>}
 *   watchlist={<WatchlistItems items={watchlistItems} />}
 * />
 * ```
 */
export const Sidebar = memo<SidebarProps>(function Sidebar({
  navigation,
  userSection,
  calendarButton,
  watchlist,
  className,
  ...props
}) {
  const classNames = [styles.c_sidebar, className].filter(Boolean).join(' ');

  return (
    <aside className={classNames} {...props}>
      {navigation && (
        <div className={styles.c_sidebar__navigation}>{navigation}</div>
      )}

      {watchlist && (
        <div className={styles.c_sidebar__watchlist}>
          <h2 className={styles.c_sidebar__watchlist_title}>公開日が近い映画</h2>
          <div className={styles.c_sidebar__watchlist_content}>{watchlist}</div>
        </div>
      )}

      {calendarButton && (
        <div className={styles.c_sidebar__calendar}>{calendarButton}</div>
      )}

      {userSection && (
        <div className={styles.c_sidebar__user}>{userSection}</div>
      )}
    </aside>
  );
});

Sidebar.displayName = 'Sidebar';
