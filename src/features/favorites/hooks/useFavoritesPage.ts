/**
 * お気に入りページ カスタムフック
 * ソート状態管理 + useFavorites + useFavoriteToggle 統合
 */

import { useCallback, useMemo, useState } from 'react';

import { useFavorites } from '@/features/favorites/hooks/useFavorites';
import { useFavoriteToggle } from '@/features/favorites/hooks/useFavoriteToggle';
import { FAVORITES_SORT_BY, FAVORITES_SORT_ORDER } from '@/constants';
import type { FavoriteItem } from '@/lib/api/favorites/favorites';

/**
 * ソートオプション
 */
export const FAVORITES_PAGE_SORT_OPTIONS = [
  { label: '登録日順', value: 'added_at' },
  { label: '評価順', value: 'rating' },
] as const;

/**
 * useFavoritesPageフックの返り値
 */
export interface UseFavoritesPageReturn {
  /** お気に入り一覧 */
  favorites: FavoriteItem[];
  /** 読み込み中 */
  isLoading: boolean;
  /** 現在のソートキー */
  sortBy: string;
  /** ソート変更ハンドラー */
  handleSortChange: (value: string) => void;
  /** お気に入りトグル関連 */
  favoriteToggle: ReturnType<typeof useFavoriteToggle>;
}

/**
 * お気に入りページ カスタムフック
 */
export function useFavoritesPage(): UseFavoritesPageReturn {
  const [sortBy, setSortBy] = useState<string>(FAVORITES_SORT_BY.ADDED_AT);

  const { favorites, isLoading } = useFavorites({
    sort_by: sortBy as 'added_at' | 'rating',
    sort_order:
      sortBy === FAVORITES_SORT_BY.RATING
        ? FAVORITES_SORT_ORDER.DESC
        : FAVORITES_SORT_ORDER.DESC,
  });

  const favoriteToggle = useFavoriteToggle();

  const handleSortChange = useCallback((value: string) => {
    setSortBy(value);
  }, []);

  return useMemo(
    () => ({
      favorites: favorites?.favorites ?? [],
      isLoading,
      sortBy,
      handleSortChange,
      favoriteToggle,
    }),
    [favorites, isLoading, sortBy, handleSortChange, favoriteToggle],
  );
}
