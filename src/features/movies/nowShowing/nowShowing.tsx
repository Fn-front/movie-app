/**
 * NowShowingPageコンポーネント
 * 公開中映画ページのメインコンポーネント
 */

'use client';

import { memo } from 'react';

import { AppLayout } from '@/components/layout/appLayout/appLayout';
import { MovieListContent } from '@/features/movies/component/movieListContent/movieListContent';
import { useNowShowing } from '@/features/movies/nowShowing/hooks/useNowShowing';

/**
 * NowShowingPageコンポーネント
 */
export const NowShowingPage = memo(function NowShowingPage() {
  const movieList = useNowShowing();

  return (
    <AppLayout>
      <MovieListContent title="公開中の映画" movieList={movieList} />
    </AppLayout>
  );
});

NowShowingPage.displayName = 'NowShowingPage';
