/**
 * ウォッチリスト追加/削除トグル カスタムフック
 * useWatchlist + useToast を統合し、トグルロジックを一元管理
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { WATCHLIST_SUCCESS_MESSAGES } from '@/constants/watchlist';
import { useWatchlist } from '@/features/watchlist/hooks/useWatchlist';
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
 * toggleWatchlist内で参照する最新の関数群（参照安定化用）
 */
interface ToggleHandlers {
  isInWatchlist: (tmdbMovieId: number) => boolean;
  getWatchlistId: (tmdbMovieId: number) => string | undefined;
  addToWatchlist: (data: {
    tmdb_movie_id: number;
    title: string;
    poster_path: string | null;
    release_date: string | null;
  }) => void;
  removeFromWatchlist: (id: string) => void;
  toast: (options: { title: string; variant: string }) => void;
}

/**
 * ウォッチリスト追加/削除トグル カスタムフック
 */
export function useWatchlistToggle(): UseWatchlistToggleReturn {
  const {
    isInWatchlist,
    getWatchlistId,
    addToWatchlist,
    removeFromWatchlist,
    isAdding,
    isRemoving,
  } = useWatchlist();
  const { toast } = useToast();

  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());

  // mutation完了時にtogglingIdsをリセット
  useEffect(() => {
    if (!isAdding && !isRemoving) {
      setTogglingIds(new Set());
    }
  }, [isAdding, isRemoving]);

  // 最新の関数群を単一refで保持し、toggleWatchlistの参照を安定させる
  const handlersRef = useRef<ToggleHandlers>({
    isInWatchlist,
    getWatchlistId,
    addToWatchlist,
    removeFromWatchlist,
    toast,
  });
  handlersRef.current = {
    isInWatchlist,
    getWatchlistId,
    addToWatchlist,
    removeFromWatchlist,
    toast,
  };

  const toggleWatchlist = useCallback(
    (movie: WatchlistToggleMovie) => {
      setTogglingIds((prev) => new Set(prev).add(movie.id));

      const h = handlersRef.current;
      if (h.isInWatchlist(movie.id)) {
        const watchlistId = h.getWatchlistId(movie.id);
        if (watchlistId) {
          h.removeFromWatchlist(watchlistId);
          h.toast({
            title: WATCHLIST_SUCCESS_MESSAGES.REMOVED,
            variant: 'success',
          });
        }
      } else {
        h.addToWatchlist({
          tmdb_movie_id: movie.id,
          title: movie.title,
          poster_path: movie.poster_path,
          release_date: movie.release_date,
        });
        h.toast({
          title: WATCHLIST_SUCCESS_MESSAGES.ADDED,
          variant: 'success',
        });
      }
    },
    [],
  );

  const isMovieToggling = useCallback(
    (tmdbMovieId: number) => togglingIds.has(tmdbMovieId),
    [togglingIds],
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
