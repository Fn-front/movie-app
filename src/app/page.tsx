import type { Metadata } from 'next';

import { HomePage } from '@/features/home/home';
import { getNowShowingMovies } from '@/lib/api/nowShowing/nowShowing.server';

export const metadata: Metadata = {
  title: 'ホーム | Movie App',
  description: '公開予定の映画一覧を確認できます',
};

export default async function Home() {
  const nowShowingMovies = await getNowShowingMovies();

  return <HomePage nowShowingMovies={nowShowingMovies} />;
}
