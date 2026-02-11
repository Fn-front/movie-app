import type { Metadata } from 'next';

import { NowShowingPageLoader } from './loader';

export const metadata: Metadata = {
  title: '公開中 | Movie App',
  description: '現在公開中の映画一覧を確認できます',
};

export default function NowShowing() {
  return <NowShowingPageLoader />;
}
