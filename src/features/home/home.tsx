/**
 * HomePageコンポーネント
 * ホーム画面のメインコンポーネント（Server Component）
 */

import { AppLayout } from '@/components/layout/appLayout/appLayout';
import { NowShowingMovieList } from '@/features/nowShowing/component/nowShowingMovieList/nowShowingMovieList';
import { RecommendationSection } from '@/features/recommendations/component/recommendationSection/recommendationSection';
import type { NowShowingMovie } from '@/lib/types';
import type { Recommendation } from '@/schema/recommendations';

/**
 * HomePageコンポーネントのプロパティ
 */
export interface HomePageProps {
  /** 劇場公開中の人気映画一覧 */
  nowShowingMovies: NowShowingMovie[];
  /** レコメンド一覧 */
  recommendations: Recommendation[];
  /** お気に入りが1件以上あるか */
  hasFavorites: boolean;
}

/**
 * HomePageコンポーネント
 */
export function HomePage({
  nowShowingMovies,
  recommendations,
  hasFavorites,
}: HomePageProps) {
  return (
    <AppLayout>
      <NowShowingMovieList movies={nowShowingMovies} />
      <RecommendationSection
        recommendations={recommendations}
        hasFavorites={hasFavorites}
      />
    </AppLayout>
  );
}
