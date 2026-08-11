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

        <main className={styles.c_app_layout__main}>{children}</main>
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
