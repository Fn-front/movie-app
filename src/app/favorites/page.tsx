import type { Metadata } from 'next';

import { FavoritesPageLoader } from './loader';

export const metadata: Metadata = {
  title: 'お気に入り | Movie App',
  description: 'お気に入りに登録した映画の一覧を確認できます',
};

export default function Favorites() {
  return <FavoritesPageLoader />;
}
