'use client';

import dynamic from 'next/dynamic';

const SearchPage = dynamic(
  () =>
    import('@/features/search/searchPage').then((m) => ({
      default: m.SearchPage,
    })),
  { ssr: false },
);

export function SearchPageLoader() {
  return <SearchPage />;
}
