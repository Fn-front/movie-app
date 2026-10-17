import { Suspense } from 'react';
import type { Metadata } from 'next';

import { Loading } from '@/components/ui/loading/loading';

import { NowShowingPageLoader } from './loader';

export const metadata: Metadata = {
  title: '公開中 | Movie App',
  description: '現在公開中の映画一覧を確認できます',
};

export default function NowShowing() {
  // 一覧はフィルター状態をURLクエリから復元するため useSearchParams を使う。
  // プリレンダリング時はこのSuspense境界までがクライアントレンダリングに切り替わり、
  // 境界より上（レイアウト等）は初期HTMLとして配信される。
  return (
    <Suspense fallback={<Loading size='lg' label='読み込み中...' />}>
      <NowShowingPageLoader />
    </Suspense>
  );
}
