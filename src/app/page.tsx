import type { Metadata } from 'next';

import { HomePage } from '@/features/home/home';

export const metadata: Metadata = {
  title: 'ホーム | Movie App',
  description: '公開予定の映画一覧を確認できます',
};

export default function Home() {
  return <HomePage />;
}
