/**
 * ウォッチリストページ カスタムフック
 * ソート状態管理 + useWatchlist統合
 */

import { useCallback, useMemo, useState } from 'react';

import { useWatchlist } from '@/features/watchlist/hooks/useWatchlist';
import type { WatchlistSortOption } from '@/schema/watchlist';

/**
 * ソートオプション
 */
export const WATCHLIST_PAGE_SORT_OPTIONS = [
  { label: '追加日順', value: 'added_at' },
  { label: '公開日が近い順', value: 'release_date_proximity' },
] as const;

/**
 * useWatchlistPageフックの返り値
 */
export interface UseWatchlistPageReturn {
  /** ウォッチリスト一覧 */
  watchlist: ReturnType<typeof useWatchlist>['watchlist'];
  /** 初回読み込み中 */
  isLoading: boolean;
  /** 次ページ読み込み中 */
  isFetchingNextPage: boolean;
  /** 次ページがあるか */
  hasNextPage: boolean;
  /** 次ページを読み込む */
  fetchNextPage: () => void;
  /** ウォッチリストから削除 */
  removeFromWatchlist: (id: string) => void;
  /** 現在のソートキー */
  sortBy: WatchlistSortOption;
  /** ソート変更ハンドラー */
  handleSortChange: (value: string) => void;
}

/**
 * ウォッチリストページ カスタムフック
 */
export function useWatchlistPage(): UseWatchlistPageReturn {
  const [sortBy, setSortBy] = useState<WatchlistSortOption>('added_at');

  const {
    watchlist,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    removeFromWatchlist,
  } = useWatchlist({ sort: sortBy });

  const handleSortChange = useCallback((value: string) => {
    setSortBy(value as WatchlistSortOption);
  }, []);

  return useMemo(
    () => ({
      watchlist,
      isLoading,
      isFetchingNextPage,
      hasNextPage,
      fetchNextPage,
      removeFromWatchlist,
      sortBy,
      handleSortChange,
    }),
    [
      watchlist,
      isLoading,
      isFetchingNextPage,
      hasNextPage,
      fetchNextPage,
      removeFromWatchlist,
      sortBy,
      handleSortChange,
    ],
  );
}
