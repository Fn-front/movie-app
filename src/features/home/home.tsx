/**
 * HomePageコンポーネント
 * ホーム画面のメインコンポーネント
 */

'use client';

import { memo } from 'react';

import { AppLayout } from '@/components/layout/appLayout/appLayout';

import { MovieContent } from '@/features/home/component/movieContent';

/**
 * HomePageコンポーネント
 */
export const HomePage = memo(function HomePage() {
  return (
    <AppLayout>
      <MovieContent />
    </AppLayout>
  );
});

HomePage.displayName = 'HomePage';
