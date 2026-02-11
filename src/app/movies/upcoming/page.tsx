import type { Metadata } from 'next';

import { UpcomingPage } from '@/features/movies/upcoming/upcoming';

export const metadata: Metadata = {
  title: '公開予定 | Movie App',
  description: '今後公開予定の映画一覧を確認できます',
};

export default function Upcoming() {
  return <UpcomingPage />;
}
