/**
 * ウォッチリスト追加/削除トグル カスタムフック
 * 既存のウォッチリストキャッシュを参照 + mutation直接実行で、
 * 重複リクエストを防止する
 */

import { useCallback, useMemo, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

import {
  WATCHLIST_ERROR_MESSAGES,
  WATCHLIST_SUCCESS_MESSAGES,
} from '@/constants/watchlist';
import { watchlistKeys } from '@/constants';
import { addWatchlist, removeWatchlist } from '@/lib/api/watchlist/watchlist';
import type {
  WatchlistItem,
  GetWatchlistResponse,
} from '@/lib/api/watchlist/watchlist';
import type { WatchlistAddFormData } from '@/schema/watchlist';
import { useToast } from '@/hooks/useToast';

/**
 * トグル対象の映画データ（最小限のフィールド）
 */
interface WatchlistToggleMovie {
  /** TMDb映画ID */
  id: number;
  /** 映画タイトル */
  title: string;
  /** ポスター画像パス */
  poster_path: string | null;
  /** 公開日 */
  release_date: string | null;
}

/**
 * useWatchlistToggleフックの返り値
 */
export interface UseWatchlistToggleReturn {
  /** 指定映画がウォッチリストに含まれているか */
  isInWatchlist: (tmdbMovieId: number) => boolean;
  /** ウォッチリスト追加/削除をトグル */
  toggleWatchlist: (movie: WatchlistToggleMovie) => void;
  /** 追加/削除処理中 */
  isToggling: boolean;
  /** 指定映画がトグル処理中かどうか（per-movie無効化用） */
  isMovieToggling: (tmdbMovieId: number) => boolean;
}

/** InfiniteQueryのデータ型 */
type WatchlistInfiniteData = {
  pages: GetWatchlistResponse[];
  pageParams: (string | undefined)[];
};

/**
 * 既存のウォッチリストキャッシュから全アイテムを取得する
 * watchlistKeys.all をプレフィックスとして、どのsortオプションのキャッシュからも読み取る
 */
function getWatchlistItemsFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
): WatchlistItem[] {
  const queries = queryClient.getQueriesData<WatchlistInfiniteData>({
    queryKey: watchlistKeys.all,
  });

  const items: WatchlistItem[] = [];
  for (const [, data] of queries) {
    if (data?.pages) {
      for (const page of data.pages) {
        items.push(...page.data.watchlist);
      }
    }
  }
  return items;
}

/**
 * 全ウォッチリストキャッシュに楽観的にアイテムを追加する
 */
function optimisticAddToAllCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  item: WatchlistItem,
): Map<readonly unknown[], WatchlistInfiniteData | undefined> {
  const previousDataMap = new Map<
    readonly unknown[],
    WatchlistInfiniteData | undefined
  >();

  const queries = queryClient.getQueriesData<WatchlistInfiniteData>({
    queryKey: watchlistKeys.all,
  });

  for (const [key, data] of queries) {
    previousDataMap.set(key, data);
    if (data?.pages && data.pages.length > 0) {
      queryClient.setQueryData<WatchlistInfiniteData>(key, {
        ...data,
        pages: data.pages.map((page, i) =>
          i === 0
            ? {
                ...page,
                data: {
                  ...page.data,
                  watchlist: [item, ...page.data.watchlist],
                },
              }
            : page,
        ),
      });
    }
  }

  return previousDataMap;
}

/**
 * 全ウォッチリストキャッシュから楽観的にアイテムを削除する
 */
function optimisticRemoveFromAllCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
): Map<readonly unknown[], WatchlistInfiniteData | undefined> {
  const previousDataMap = new Map<
    readonly unknown[],
    WatchlistInfiniteData | undefined
  >();

  const queries = queryClient.getQueriesData<WatchlistInfiniteData>({
    queryKey: watchlistKeys.all,
  });

  for (const [key, data] of queries) {
    previousDataMap.set(key, data);
    if (data?.pages) {
      queryClient.setQueryData<WatchlistInfiniteData>(key, {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          data: {
            ...page.data,
            watchlist: page.data.watchlist.filter((item) => item.id !== id),
          },
        })),
      });
    }
  }

  return previousDataMap;
}

/**
 * キャッシュをロールバックする
 */
function rollbackCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  previousDataMap: Map<readonly unknown[], WatchlistInfiniteData | undefined>,
): void {
  for (const [key, data] of previousDataMap) {
    queryClient.setQueryData(key, data);
  }
}

/**
 * ウォッチリスト追加/削除トグル カスタムフック
 *
 * useWatchlist()を呼ばず、既存のウォッチリストキャッシュを直接参照することで
 * 重複リクエストを防止する。楽観的UI更新は全キャッシュに対して行う。
 */
export function useWatchlistToggle(): UseWatchlistToggleReturn {
  const queryClient = useQueryClient();
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && !!session?.user;
  const { toast } = useToast();

  const togglingIdRef = useRef<number | null>(null);

  const addMutation = useMutation({
    mutationFn: addWatchlist,
    onMutate: async (newItem: WatchlistAddFormData) => {
      await queryClient.cancelQueries({ queryKey: watchlistKeys.all });

      const optimisticItem: WatchlistItem = {
        id: `optimistic-${Date.now()}`,
        tmdb_movie_id: newItem.tmdb_movie_id,
        title: newItem.title,
        poster_path: newItem.poster_path ?? null,
        release_date: newItem.release_date ?? null,
        added_at: new Date().toISOString(),
      };

      const previousDataMap = optimisticAddToAllCaches(
        queryClient,
        optimisticItem,
      );
      return { previousDataMap };
    },
    onError: (_error, _newItem, context) => {
      if (context?.previousDataMap) {
        rollbackCaches(queryClient, context.previousDataMap);
      }
      toast({
        title: 'エラー',
        description: WATCHLIST_ERROR_MESSAGES.ADD_FAILED,
        variant: 'error',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeWatchlist,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: watchlistKeys.all });

      const previousDataMap = optimisticRemoveFromAllCaches(queryClient, id);
      return { previousDataMap };
    },
    onError: (_error, _id, context) => {
      if (context?.previousDataMap) {
        rollbackCaches(queryClient, context.previousDataMap);
      }
      toast({
        title: 'エラー',
        description: WATCHLIST_ERROR_MESSAGES.REMOVE_FAILED,
        variant: 'error',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
    },
  });

  const isInWatchlist = useCallback(
    (tmdbMovieId: number) => {
      if (!isAuthenticated) return false;
      const items = getWatchlistItemsFromCache(queryClient);
      return items.some((item) => item.tmdb_movie_id === tmdbMovieId);
    },
    [isAuthenticated, queryClient],
  );

  const getWatchlistId = useCallback(
    (tmdbMovieId: number): string | undefined => {
      const items = getWatchlistItemsFromCache(queryClient);
      return items.find((item) => item.tmdb_movie_id === tmdbMovieId)?.id;
    },
    [queryClient],
  );

  const toggleWatchlist = useCallback(
    (movie: WatchlistToggleMovie) => {
      togglingIdRef.current = movie.id;

      if (isInWatchlist(movie.id)) {
        const watchlistId = getWatchlistId(movie.id);
        if (watchlistId) {
          removeMutation.mutate(watchlistId);
          toast({
            title: WATCHLIST_SUCCESS_MESSAGES.REMOVED,
            variant: 'success',
          });
        }
      } else {
        addMutation.mutate({
          tmdb_movie_id: movie.id,
          title: movie.title,
          poster_path: movie.poster_path,
          release_date: movie.release_date,
        });
        toast({
          title: WATCHLIST_SUCCESS_MESSAGES.ADDED,
          variant: 'success',
        });
      }
    },
    [isInWatchlist, getWatchlistId, addMutation, removeMutation, toast],
  );

  const isAdding = addMutation.isPending;
  const isRemoving = removeMutation.isPending;

  const isMovieToggling = useCallback(
    (tmdbMovieId: number) =>
      (isAdding || isRemoving) && togglingIdRef.current === tmdbMovieId,
    [isAdding, isRemoving],
  );

  return useMemo(
    () => ({
      isInWatchlist,
      toggleWatchlist,
      isToggling: isAdding || isRemoving,
      isMovieToggling,
    }),
    [isInWatchlist, toggleWatchlist, isAdding, isRemoving, isMovieToggling],
  );
}
