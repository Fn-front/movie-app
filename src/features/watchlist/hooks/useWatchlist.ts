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

import {
  getWatchlist,
  addWatchlist,
  removeWatchlist,
  updateWatched,
} from '@/lib/api/watchlist/watchlist';
import type {
  WatchlistItem,
  GetWatchlistResponse,
} from '@/lib/api/watchlist/watchlist';
import type {
  WatchlistAddFormData,
  WatchlistSortOption,
} from '@/schema/watchlist';
import { useAuthStatus } from '@/hooks/useAuthStatus';
import { useToastDispatch } from '@/hooks/useToast';
import {
  ANALYTICS_EVENTS,
  watchlistKeys,
  WATCHLIST_DEFAULT_LIMIT,
  WATCHLIST_ERROR_MESSAGES,
} from '@/constants';
import { sendEvent } from '@/utils/analytics';

/**
 * useWatchlistフックのオプション
 */
export interface UseWatchlistOptions {
  /** ソート方式 */
  sort?: WatchlistSortOption;
  /** 1ページあたりの取得件数 */
  limit?: number;
  /** 視聴済みを除外するか（サイドバー用） */
  excludeWatched?: boolean;
  /** 配信中の未視聴を先頭に出すか（一覧ページのみ true） */
  prioritizeStreaming?: boolean;
}

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
  /** 視聴済みを付け外しする */
  setWatched: (id: string, watched: boolean) => void;
  /** 指定映画がウォッチリストに含まれているか */
  isInWatchlist: (tmdbMovieId: number) => boolean;
  /** 指定映画のウォッチリストIDを取得 */
  getWatchlistId: (tmdbMovieId: number) => string | undefined;
  /** 追加中 */
  isAdding: boolean;
  /** 削除中 */
  isRemoving: boolean;
  /** 視聴済みの更新中 */
  isUpdatingWatched: boolean;
}

/**
 * ウォッチリスト カスタムフック
 */
export function useWatchlist(
  options: UseWatchlistOptions = {},
): UseWatchlistReturn {
  const {
    sort = 'added_at',
    limit = WATCHLIST_DEFAULT_LIMIT,
    excludeWatched = false,
    prioritizeStreaming = false,
  } = options;
  const { isAuthenticated, isResolving } = useAuthStatus();
  const queryClient = useQueryClient();
  const { toast } = useToastDispatch();

  // ウォッチリスト一覧取得（無限スクロール）
  const watchlistQuery = useInfiniteQuery({
    queryKey: watchlistKeys.list({ sort, excludeWatched, prioritizeStreaming }),
    queryFn: ({ pageParam }) =>
      getWatchlist({
        cursor: pageParam,
        limit,
        sort,
        exclude_watched: excludeWatched,
        prioritize_streaming: prioritizeStreaming,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.data.has_more
        ? (lastPage.data.next_cursor ?? undefined)
        : undefined,
    enabled: isAuthenticated,
  });

  const queryKey = watchlistKeys.list({
    sort,
    excludeWatched,
    prioritizeStreaming,
  });

  // 追加mutation（楽観的UI更新）
  const addMutation = useMutation({
    mutationFn: addWatchlist,
    onMutate: async (newItem) => {
      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData<{
        pages: GetWatchlistResponse[];
        pageParams: (string | undefined)[];
      }>(queryKey);

      // 楽観的に追加
      const optimisticItem: WatchlistItem = {
        id: `optimistic-${Date.now()}`,
        tmdb_movie_id: newItem.tmdb_movie_id,
        title: newItem.title,
        poster_path: newItem.poster_path ?? null,
        release_date: newItem.release_date ?? null,
        added_at: new Date().toISOString(),
        watched_at: null,
        streaming: null,
      };

      queryClient.setQueryData<{
        pages: GetWatchlistResponse[];
        pageParams: (string | undefined)[];
      }>(queryKey, (old) => {
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
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast({
        title: 'エラー',
        description: WATCHLIST_ERROR_MESSAGES.ADD_FAILED,
        variant: 'error',
      });
    },
    onSettled: () => {
      // 全ソートのキャッシュを無効化
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
    },
  });

  // 削除mutation（楽観的UI更新）
  const removeMutation = useMutation({
    mutationFn: removeWatchlist,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData<{
        pages: GetWatchlistResponse[];
        pageParams: (string | undefined)[];
      }>(queryKey);

      // 楽観的に削除
      queryClient.setQueryData<{
        pages: GetWatchlistResponse[];
        pageParams: (string | undefined)[];
      }>(queryKey, (old) => {
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
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast({
        title: 'エラー',
        description: WATCHLIST_ERROR_MESSAGES.REMOVE_FAILED,
        variant: 'error',
      });
    },
    onSettled: () => {
      // 全ソートのキャッシュを無効化
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
    },
  });

  // 視聴済み mutation（楽観的UI更新）
  const watchedMutation = useMutation({
    mutationFn: updateWatched,
    onMutate: async ({ id, watched }) => {
      await queryClient.cancelQueries({ queryKey });

      const previousData = queryClient.getQueryData<{
        pages: GetWatchlistResponse[];
        pageParams: (string | undefined)[];
      }>(queryKey);

      // 楽観的に watched_at を書き換える。
      // 並び替え（視聴済みを最下部へ）はサーバー側の責務なので、
      // ここでは状態だけ反映し、確定後の invalidate で並びを整える。
      const watchedAt = watched ? new Date().toISOString() : null;

      queryClient.setQueryData<{
        pages: GetWatchlistResponse[];
        pageParams: (string | undefined)[];
      }>(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: {
              ...page.data,
              watchlist: page.data.watchlist.map((item) =>
                item.id === id ? { ...item, watched_at: watchedAt } : item,
              ),
            },
          })),
        };
      });

      return { previousData };
    },
    onError: (_error, _variables, context) => {
      // エラー時にロールバック
      if (context?.previousData) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
      toast({
        title: 'エラー',
        description: WATCHLIST_ERROR_MESSAGES.WATCHED_UPDATE_FAILED,
        variant: 'error',
      });
    },
    onSettled: () => {
      // 並び順とサイドバー（視聴済み除外）にも効かせるため全キャッシュを無効化
      queryClient.invalidateQueries({ queryKey: watchlistKeys.all });
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
      // 一覧ページとサイドバーの削除はこの経路を通る。useWatchlistToggle
      // （詳細モーダルのトグル）とは別実装なので、そちらだけに計測を置くと
      // 追加は全経路・削除は詳細モーダルのみとなり、追加/削除比が歪む。
      //
      // 引数は watchlist の行IDなので、作品IDは一覧から引き直す。
      // この経路の呼び出し元は対象行を描画しているため必ず見つかる
      const movieId = watchlist.find((item) => item.id === id)?.tmdb_movie_id;

      removeMutation.mutate(id);

      if (movieId !== undefined) {
        sendEvent(ANALYTICS_EVENTS.WATCHLIST_REMOVE, { movie_id: movieId });
      }
    },
    [removeMutation, watchlist],
  );

  const setWatched = useCallback(
    (id: string, watched: boolean) => {
      watchedMutation.mutate({ id, watched });
    },
    [watchedMutation],
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
      // セッション未確定で、まだ何も無いときは読み込み中として返す。
      // react-query は無効化中のクエリの isLoading を false にするため、
      // 素通しすると「0件が確定した」ように見えて空メッセージが先に出る（#1132）。
      //
      // 件数を条件に入れるのは、`useSession().update()`（表示名の保存など）が
      // status を loading へ戻すため。無条件だと埋まっている一覧が
      // スケルトンに化ける
      isLoading:
        (isResolving && watchlist.length === 0) || watchlistQuery.isLoading,
      isFetchingNextPage: watchlistQuery.isFetchingNextPage,
      hasNextPage: watchlistQuery.hasNextPage,
      fetchNextPage,
      addToWatchlist,
      removeFromWatchlist,
      setWatched,
      isInWatchlist,
      getWatchlistId,
      isAdding: addMutation.isPending,
      isRemoving: removeMutation.isPending,
      isUpdatingWatched: watchedMutation.isPending,
    }),
    [
      watchlist,
      isResolving,
      watchlistQuery.isLoading,
      watchlistQuery.isFetchingNextPage,
      watchlistQuery.hasNextPage,
      fetchNextPage,
      addToWatchlist,
      removeFromWatchlist,
      setWatched,
      isInWatchlist,
      getWatchlistId,
      addMutation.isPending,
      removeMutation.isPending,
      watchedMutation.isPending,
    ],
  );
}
