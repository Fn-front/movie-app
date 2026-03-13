'use client';

import dynamic from 'next/dynamic';

const WatchlistPage = dynamic(
  () =>
    import('@/features/watchlist/watchlistPage/watchlistPage').then((m) => ({
      default: m.WatchlistPage,
    })),
  { ssr: false },
);

export function WatchlistPageLoader() {
  return <WatchlistPage />;
}
