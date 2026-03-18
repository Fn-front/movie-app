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
import {
  addWatchlist,
  removeWatchlist,
} from '@/lib/api/watchlist/watchlist';
import type {
  WatchlistItem,
  GetWatchlistResponse,
} from '@/lib/api/watchlist/watchlist';
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

/**
 * 既存のウォッチリストキャッシュから全アイテムを取得する
 * watchlistKeys.all をプレフィックスとして、どのsortオプションのキャッシュからも読み取る
 */
function getWatchlistItemsFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
): WatchlistItem[] {
  const queries = queryClient.getQueriesData<{
    pages: GetWatchlistResponse[];
    pageParams: (string | undefined)[];
  }>({ queryKey: watchlistKeys.all });

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
 * ウォッチリスト追加/削除トグル カスタムフック
 *
 * useWatchlist()を呼ばず、既存のウォッチリストキャッシュを直接参照することで
 * 重複リクエストを防止する。mutation完了時にwatchlistKeys.allで全キャッシュを無効化。
 */
export function useWatchlistToggle(): UseWatchlistToggleReturn {
  const queryClient = useQueryClient();
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated' && !!session?.user;
  const { toast } = useToast();

  const togglingIdRef = useRef<number | null>(null);

  const addMutation = useMutation({
    mutationFn: addWatchlist,
    onError: () => {
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
    onError: () => {
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
