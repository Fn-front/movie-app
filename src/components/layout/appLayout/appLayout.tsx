/**
 * AppLayoutコンポーネント
 * Header/Sidebar/Footer/MobileDrawerを内包する共通レイアウト
 */

'use client';

import { type ReactNode, memo } from 'react';
import { useSession } from 'next-auth/react';

import { Header } from '@/components/layout/header/header';
import { SearchBar } from '@/components/layout/searchBar/searchBar';
import { Sidebar } from '@/components/layout/sidebar/sidebar';
import { SideNav } from '@/components/layout/sideNav/sideNav';
import { UserMenu } from '@/components/layout/userMenu/userMenu';
import { Footer } from '@/components/layout/footer/footer';
import { MobileMenuButton } from '@/components/layout/mobileMenuButton/mobileMenuButton';
import { MobileDrawer } from '@/components/layout/mobileDrawer/mobileDrawer';
import { useMobileDrawer } from '@/components/layout/mobileDrawer/useMobileDrawer';
import { WatchlistPanel } from '@/features/watchlist/component/watchlistPanel/watchlistPanel';
import { CalendarButton } from '@/features/calendar/component/calendarButton';
import { LoginPromptModal } from '@/components/ui/loginPromptModal/loginPromptModal';
import { MAIN_CONTENT_ID } from '@/constants';

import styles from './appLayout.module.scss';

/**
 * AppLayoutコンポーネントのプロパティ
 */
export interface AppLayoutProps {
  /** メインコンテンツ */
  children: ReactNode;
  /** サイドバーを表示するか */
  showSidebar?: boolean;
}

/**
 * AppLayoutコンポーネント
 *
 * @example
 * ```tsx
 * <AppLayout>
 *   <NowShowingMovieList movies={nowShowingMovies} />
 * </AppLayout>
 * ```
 */
export const AppLayout = memo<AppLayoutProps>(function AppLayout({
  children,
  showSidebar = true,
}) {
  const { isOpen, handleToggle, handleOpenChange } = useMobileDrawer();
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';

  return (
    <div className={styles.c_app_layout}>
      {/*
        ヘッダーとサイドバーを飛ばして本文へ移動する導線（WCAG 2.4.1）。
        DOM 上の最初のフォーカス可能要素にする必要があるため、
        ヘッダーより前に置く。
      */}
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className={styles.c_app_layout__skip_link}
      >
        本文へ移動
      </a>

      <div className={styles.c_app_layout__header}>
        <Header
          searchBar={<SearchBar />}
          mobileMenuButton={
            <MobileMenuButton isOpen={isOpen} onToggle={handleToggle} />
          }
        />
      </div>

      <div className={styles.c_app_layout__body}>
        {showSidebar && (
          <div className={styles.c_app_layout__sidebar}>
            <Sidebar
              navigation={<SideNav />}
              userSection={<UserMenu />}
              calendarButton={isAuthenticated ? <CalendarButton /> : undefined}
              watchlist={isAuthenticated ? <WatchlistPanel /> : undefined}
            />
          </div>
        )}

        {/* スキップリンクの移動先。tabIndex=-1 でプログラム的なフォーカスを受ける */}
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className={styles.c_app_layout__main}
        >
          {children}
        </main>
      </div>

      <div className={styles.c_app_layout__footer}>
        <Footer />
      </div>

      <MobileDrawer open={isOpen} onOpenChange={handleOpenChange} />
      <LoginPromptModal />
    </div>
  );
});

AppLayout.displayName = 'AppLayout';
