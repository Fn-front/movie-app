'use client';

import dynamic from 'next/dynamic';

import { Loading } from '@/components/ui/loading/loading';

const PersonPage = dynamic(
  () =>
    import('@/features/person/personPage').then((m) => ({
      default: m.PersonPage,
    })),
  {
    ssr: false,
    loading: () => <Loading size='md' />,
  },
);

export function PersonPageLoader({ personId }: { personId: number }) {
  return <PersonPage personId={personId} />;
}
