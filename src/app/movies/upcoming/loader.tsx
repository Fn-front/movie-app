'use client';

import dynamic from 'next/dynamic';

const UpcomingPage = dynamic(
  () =>
    import('@/features/movies/upcoming/upcoming').then((m) => ({
      default: m.UpcomingPage,
    })),
  { ssr: false },
);

export function UpcomingPageLoader() {
  return <UpcomingPage />;
}
