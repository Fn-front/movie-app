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
  /** 認証済みかどうか */
  isAuthenticated: boolean;
}

/**
 * HomePageコンポーネント
 */
export function HomePage({
  nowShowingMovies,
  recommendations,
  hasFavorites,
  isAuthenticated,
}: HomePageProps) {
  return (
    <AppLayout>
      {/*
        ホームは複数セクションの集合で「見出しに相当する可視の文言」が無いため、
        スクリーンリーダー向けにのみ h1 を置く。これが無いとページの主題が
        見出しから辿れない（axe: page-has-heading-one）。
      */}
      <h1 className='sr-only'>ホーム</h1>
      <NowShowingMovieList movies={nowShowingMovies} />
      {isAuthenticated && (
        <RecommendationSection
          recommendations={recommendations}
          hasFavorites={hasFavorites}
        />
      )}
    </AppLayout>
  );
}
