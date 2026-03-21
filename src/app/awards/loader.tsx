'use client';

import dynamic from 'next/dynamic';

const AwardsPage = dynamic(
  () =>
    import('@/features/awards/awardsPage/awardsPage').then((m) => ({
      default: m.AwardsPage,
    })),
  { ssr: false },
);

export function AwardsPageLoader() {
  return <AwardsPage />;
}
