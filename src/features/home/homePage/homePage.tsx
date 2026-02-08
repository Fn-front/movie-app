/**
 * HomePageコンポーネント
 * ホーム画面のメインコンポーネント
 */

'use client';

import { memo } from 'react';

import { AppLayout } from '@/components/layout/appLayout/appLayout';
import { Header } from '@/components/layout/header/header';
import { Sidebar } from '@/components/layout/sidebar/sidebar';
import { Footer } from '@/components/layout/footer/footer';

import styles from './homePage.module.scss';

/**
 * HomePageコンポーネント
 * AppLayoutにHeader/Sidebar/Footerを配置し、メインコンテンツを表示する
 */
export const HomePage = memo(function HomePage() {
  return (
    <AppLayout
      header={<Header />}
      sidebar={<Sidebar />}
      footer={<Footer />}
    >
      <div className={styles.c_home_page}>
        <p className={styles.c_home_page__placeholder}>
          映画一覧はStep 2で実装
        </p>
      </div>
    </AppLayout>
  );
});

HomePage.displayName = 'HomePage';
