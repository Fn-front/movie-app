'use client';

import dynamic from 'next/dynamic';

const FavoritesPage = dynamic(
  () =>
    import('@/features/favorites/favoritesPage/favoritesPage').then((m) => ({
      default: m.FavoritesPage,
    })),
  { ssr: false },
);

export function FavoritesPageLoader() {
  return <FavoritesPage />;
}
