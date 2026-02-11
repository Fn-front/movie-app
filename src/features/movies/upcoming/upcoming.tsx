/**
 * UpcomingPageコンポーネント
 * 公開予定映画ページのメインコンポーネント
 */

'use client';

import { memo } from 'react';

import { MovieListContent } from '@/features/movies/component/movieListContent/movieListContent';
import { useUpcoming } from '@/features/movies/upcoming/hooks/useUpcoming';

/**
 * UpcomingPageコンポーネント
 */
export const UpcomingPage = memo(function UpcomingPage() {
  const movieList = useUpcoming();

  return <MovieListContent title='公開予定の映画' movieList={movieList} />;
});

UpcomingPage.displayName = 'UpcomingPage';
