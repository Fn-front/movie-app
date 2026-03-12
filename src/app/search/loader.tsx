'use client';

import dynamic from 'next/dynamic';

const SearchPage = dynamic(
  () =>
    import('@/features/search/searchPage').then((m) => ({
      default: m.SearchPage,
    })),
  {
    ssr: false,
    loading: () => <p>読み込み中...</p>,
  },
);

export function SearchPageLoader() {
  return <SearchPage />;
}
