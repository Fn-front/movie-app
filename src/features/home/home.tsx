/**
 * HomePageコンポーネント
 * ホーム画面のメインコンポーネント
 */

'use client';

import { memo } from 'react';

import { AppLayout } from '@/components/layout/appLayout/appLayout';
import { TrendingMovieList } from '@/features/trending/component/trendingMovieList/trendingMovieList';

/**
 * HomePageコンポーネント
 */
export const HomePage = memo(function HomePage() {
  return (
    <AppLayout>
      <TrendingMovieList />
    </AppLayout>
  );
});

HomePage.displayName = 'HomePage';
