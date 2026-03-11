/**
 * ウォッチリスト カスタムフック
 * useInfiniteQuery（一覧用）、useMutation（追加・削除、楽観的UI更新）
 */

import { useCallback, useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { useSession } from 'next-auth/react';

import {
  getWatchlist,
  addWatchlist,
  removeWatchlist,
} from '@/lib/api/watchlist/watchlist';
import type {
  WatchlistItem,
  GetWatchlistResponse,
} from '@/lib/api/watchlist/watchlist';
import type { WatchlistAddFormData } from '@/schema/watchlist';
import { useToast } from '@/hooks/useToast';
import {
  watchlistKeys,
  WATCHLIST_DEFAULT_LIMIT,
  WATCHLIST_ERROR_MESSAGES,
} from '@/constants';

/**
 * useWatchlistフックの返り値
 */
export interface UseWatchlistReturn {
  /** ウォッチリストアイテム一覧 */
  watchlist: WatchlistItem[];
  /** 初回読み込み中 */
  isLoading: boolean;
  /** 次ページ読み込み中 */
  isFetchingNextPage: boolean;
  /** 次ページがあるか */
  hasNextPage: boolean;
  /** 次ページを読み込む */
  fetchNextPage: () => void;
  /** ウォッチリストに追加 */
  addToWatchlist: (data: WatchlistAddFormData) => void;
  /** ウォッチリストから削除 */
  removeFromWatchlist: (id: string) => void;
  /** 指定映画がウォッチリストに含まれているか */
  isInWatchlist: (tmdbMovieId: number) => boolean;
  /** 指定映画のウォッチリストIDを取得 */
  getWatchlistId: (tmdbMovieId: number) => string | undefined;
  /** 追加中 */
  isAdding: boolean;
  /** 削除中 */
  isRemoving: boolean;
}

/**
 * ウォッチリスト カスタムフック
 */
export function useWatchlist(): UseWatchlistReturn {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && !!session?.user;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ウォッチリスト一覧取得（無限スクロール）
  const watchlistQuery = useInfiniteQuery({
    queryKey: watchlistKeys.list(),
    queryFn: ({ pageParam }) =>
      getWatchlist({
        cursor: pageParam,
        limit: WATCHLIST_DEFAULT_LIMIT,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.data.has_more
        ? (lastPage.data.next_cursor ?? undefined)
        : undefined,
    enabled: isAuthenticated,
  });

  // 追加mutation（楽観的UI更新）
  const addMutation = useMutation({
    mutationFn: addWatchlist,
    onMutate: async (newItem) => {
      await queryClient.cancelQueries({ queryKey: watchlistKeys.list() });

      const previousData = queryClient.getQueryData<{
        pages: GetWatchlistResponse[];
        pageParams: (string | undefined)[];
      }>(watchlistKeys.list());

      // 楽観的に追加
      const optimisticItem: WatchlistItem = {
        id: `optimistic-${Date.now()}`,
        tmdb_movie_id: newItem.tmdb_movie_id,
        title: newItem.title,
        poster_path: newItem.poster_path ?? null,
        release_date: newItem.release_date ?? null,
        added_at: new Date().toISOString(),
      };

      queryClient.setQueryData<{
        pages: GetWatchlistResponse[];
        pageParams: (string | undefined)[];
      }>(watchlistKeys.list(), (old) => {
        if (!old) return old;
        const newPages = [...old.pages];
        if (newPages.length > 0) {
          newPages[0] = {
            ...newPages[0],
            data: {
              ...newPages[0].data,
              watchlist: [optimisticItem, ...newPages[0].data.watchlist],
            },
          };
        }
        return { ...old, pages: newPages };
      });

      return { previousData };
    },
    onError: (_error, _newItem, context) => {
      // エラー時にロールバック
      if (context?.previousData) {
        queryClient.setQueryData(watchlistKeys.list(), context.previousData);
      }
      toast({
        title: 'エラー',
        description: WATCHLIST_ERROR_MESSAGES.ADD_FAILED,
        variant: 'error',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: watchlistKeys.list() });
    },
  });

  // 削除mutation（楽観的UI更新）
  const removeMutation = useMutation({
    mutationFn: removeWatchlist,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: watchlistKeys.list() });

      const previousData = queryClient.getQueryData<{
        pages: GetWatchlistResponse[];
        pageParams: (string | undefined)[];
      }>(watchlistKeys.list());

      // 楽観的に削除
      queryClient.setQueryData<{
        pages: GetWatchlistResponse[];
        pageParams: (string | undefined)[];
      }>(watchlistKeys.list(), (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: {
              ...page.data,
              watchlist: page.data.watchlist.filter((item) => item.id !== id),
            },
          })),
        };
      });

      return { previousData };
    },
    onError: (_error, _id, context) => {
      // エラー時にロールバック
      if (context?.previousData) {
        queryClient.setQueryData(watchlistKeys.list(), context.previousData);
      }
      toast({
        title: 'エラー',
        description: WATCHLIST_ERROR_MESSAGES.REMOVE_FAILED,
        variant: 'error',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: watchlistKeys.list() });
    },
  });

  // 全ページのウォッチリストを結合
  const watchlist = useMemo(
    () =>
      watchlistQuery.data?.pages.flatMap((page) => page.data.watchlist) ?? [],
    [watchlistQuery.data],
  );

  const addToWatchlist = useCallback(
    (data: WatchlistAddFormData) => {
      addMutation.mutate(data);
    },
    [addMutation],
  );

  const removeFromWatchlist = useCallback(
    (id: string) => {
      removeMutation.mutate(id);
    },
    [removeMutation],
  );

  const isInWatchlist = useCallback(
    (tmdbMovieId: number) => {
      return watchlist.some((item) => item.tmdb_movie_id === tmdbMovieId);
    },
    [watchlist],
  );

  const getWatchlistId = useCallback(
    (tmdbMovieId: number) => {
      return watchlist.find((item) => item.tmdb_movie_id === tmdbMovieId)?.id;
    },
    [watchlist],
  );

  const fetchNextPage = useCallback(() => {
    watchlistQuery.fetchNextPage();
  }, [watchlistQuery]);

  return useMemo(
    () => ({
      watchlist,
      isLoading: watchlistQuery.isLoading,
      isFetchingNextPage: watchlistQuery.isFetchingNextPage,
      hasNextPage: watchlistQuery.hasNextPage,
      fetchNextPage,
      addToWatchlist,
      removeFromWatchlist,
      isInWatchlist,
      getWatchlistId,
      isAdding: addMutation.isPending,
      isRemoving: removeMutation.isPending,
    }),
    [
      watchlist,
      watchlistQuery.isLoading,
      watchlistQuery.isFetchingNextPage,
      watchlistQuery.hasNextPage,
      fetchNextPage,
      addToWatchlist,
      removeFromWatchlist,
      isInWatchlist,
      getWatchlistId,
      addMutation.isPending,
      removeMutation.isPending,
    ],
  );
}
