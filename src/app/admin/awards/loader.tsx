'use client';

import dynamic from 'next/dynamic';

const AwardsSyncPage = dynamic(
  () =>
    import('@/features/admin/awardsSyncPage/awardsSyncPage').then((m) => ({
      default: m.AwardsSyncPage,
    })),
  { ssr: false },
);

export function AwardsSyncPageLoader() {
  return <AwardsSyncPage />;
}
