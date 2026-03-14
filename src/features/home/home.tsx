/**
 * HomePageコンポーネント
 * ホーム画面のメインコンポーネント（Server Component）
 */

import { AppLayout } from '@/components/layout/appLayout/appLayout';
import { NowShowingMovieList } from '@/features/nowShowing/component/nowShowingMovieList/nowShowingMovieList';
import type { NowShowingMovie } from '@/lib/types';

/**
 * HomePageコンポーネントのプロパティ
 */
export interface HomePageProps {
  /** 劇場公開中の人気映画一覧 */
  nowShowingMovies: NowShowingMovie[];
}

/**
 * HomePageコンポーネント
 */
export function HomePage({ nowShowingMovies }: HomePageProps) {
  return (
    <AppLayout>
      <NowShowingMovieList movies={nowShowingMovies} />
    </AppLayout>
  );
}
