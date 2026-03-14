/**
 * HomePageコンポーネント
 * ホーム画面のメインコンポーネント
 */

'use client';

import { memo } from 'react';

import { AppLayout } from '@/components/layout/appLayout/appLayout';
import { NowShowingMovieList } from '@/features/nowShowing/component/nowShowingMovieList/nowShowingMovieList';

/**
 * HomePageコンポーネント
 */
export const HomePage = memo(function HomePage() {
  return (
    <AppLayout>
      <NowShowingMovieList />
    </AppLayout>
  );
});

HomePage.displayName = 'HomePage';
