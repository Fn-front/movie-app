/**
 * AppLayoutコンポーネント
 * Header/Sidebar/Footerを内包する共通レイアウト
 */

'use client';

import { type ReactNode, memo, useMemo } from 'react';
import { useSession } from 'next-auth/react';

import { Header } from '@/components/layout/header/header';
import { Sidebar } from '@/components/layout/sidebar/sidebar';
import { SideNav } from '@/components/layout/sideNav/sideNav';
import { UserMenu } from '@/components/layout/userMenu/userMenu';
import { Footer } from '@/components/layout/footer/footer';

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
 *   <MovieContent />
 * </AppLayout>
 * ```
 */
export const AppLayout = memo<AppLayoutProps>(function AppLayout({
  children,
  showSidebar = true,
}) {
  const { data: session, status } = useSession();

  const userMenuElement = useMemo(() => {
    if (status !== 'authenticated' || !session?.user) return undefined;

    return (
      <UserMenu
        userName={session.user.name ?? ''}
        userEmail={session.user.email ?? ''}
        userImage={session.user.image}
      />
    );
  }, [status, session]);

  return (
    <div className={styles.c_app_layout}>
      <div className={styles.c_app_layout__header}>
        <Header />
      </div>

      <div className={styles.c_app_layout__body}>
        {showSidebar && (
          <div className={styles.c_app_layout__sidebar}>
            <Sidebar navigation={<SideNav />} userSection={userMenuElement} />
          </div>
        )}

        <main className={styles.c_app_layout__main}>{children}</main>
      </div>

      <div className={styles.c_app_layout__footer}>
        <Footer />
      </div>
    </div>
  );
});

AppLayout.displayName = 'AppLayout';
