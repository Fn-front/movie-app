/**
 * HomePageコンポーネント
 * ホーム画面のメインコンポーネント
 */

'use client';

import { memo, useMemo } from 'react';

import { AppLayout } from '@/components/layout/appLayout/appLayout';
import { Header } from '@/components/layout/header/header';
import { Sidebar } from '@/components/layout/sidebar/sidebar';
import { Footer } from '@/components/layout/footer/footer';

import { MovieContent } from './component/movieContent';

/**
 * HomePageコンポーネント
 * AppLayoutにHeader/Sidebar/Footerを配置し、映画一覧を表示する
 */
export const HomePage = memo(function HomePage() {
  const header = useMemo(() => <Header />, []);
  const sidebar = useMemo(() => <Sidebar />, []);
  const footer = useMemo(() => <Footer />, []);

  return (
    <AppLayout header={header} sidebar={sidebar} footer={footer}>
      <MovieContent />
    </AppLayout>
  );
});

HomePage.displayName = 'HomePage';
