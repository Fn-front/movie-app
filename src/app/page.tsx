import type { Metadata } from 'next';

import { HomePage } from '@/features/home/home';
import { auth } from '@/lib/auth/auth';
import { getNowShowingMovies } from '@/lib/api/nowShowing/nowShowing.server';
import { getRecommendations } from '@/lib/api/recommendations/recommendations.server';

export const metadata: Metadata = {
  title: 'ホーム | Movie App',
  description: '公開予定の映画一覧を確認できます',
};

export default async function Home() {
  const session = await auth();
  const isAuthenticated = !!session?.user;

  const [nowShowingMovies, recommendationData] = await Promise.all([
    getNowShowingMovies(),
    getRecommendations(),
  ]);

  return (
    <HomePage
      nowShowingMovies={nowShowingMovies}
      recommendations={recommendationData.recommendations}
      hasFavorites={recommendationData.hasFavorites}
      isAuthenticated={isAuthenticated}
    />
  );
}
