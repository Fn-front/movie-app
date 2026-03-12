import type { Metadata } from 'next';

import { SearchPageLoader } from './loader';

export const metadata: Metadata = {
  title: '検索結果 | Movie App',
  description: '映画の検索結果を表示します',
};

export default function Search() {
  return <SearchPageLoader />;
}
