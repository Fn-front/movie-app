import type { Metadata } from 'next';

import { WatchlistPageLoader } from './loader';

export const metadata: Metadata = {
  title: 'ウォッチリスト | Movie App',
  description: 'ウォッチリストに登録した映画の一覧を確認できます',
};

export default function Watchlist() {
  return <WatchlistPageLoader />;
}
