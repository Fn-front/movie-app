'use client';

import dynamic from 'next/dynamic';

const NowShowingPage = dynamic(
  () =>
    import('@/features/movies/nowShowing/nowShowing').then((m) => ({
      default: m.NowShowingPage,
    })),
  { ssr: false },
);

export function NowShowingPageLoader() {
  return <NowShowingPage />;
}
