/**
 * HomePageコンポーネント
 * ホーム画面のメインコンポーネント
 */

'use client';

import { memo } from 'react';

import { AppLayout } from '@/components/layout/appLayout/appLayout';

/**
 * HomePageコンポーネント
 */
export const HomePage = memo(function HomePage() {
  return <AppLayout>{null}</AppLayout>;
});

HomePage.displayName = 'HomePage';
