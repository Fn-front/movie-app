'use client';

import dynamic from 'next/dynamic';

const TheaterExperiencePage = dynamic(
  () =>
    import('@/features/theaterExperience/theaterExperiencePage/theaterExperiencePage').then(
      (m) => ({
        default: m.TheaterExperiencePage,
      }),
    ),
  {
    ssr: false,
    loading: () => <p>読み込み中...</p>,
  },
);

export function TheaterExperiencePageLoader({
  initialSlug,
}: {
  initialSlug: string;
}) {
  return <TheaterExperiencePage initialSlug={initialSlug} />;
}
