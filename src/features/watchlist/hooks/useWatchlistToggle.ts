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
  /** 現在トグル中の映画ID（per-movie無効化用） */
  togglingMovieId: number | null;
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

  const [togglingMovieId, setTogglingMovieId] = useState<number | null>(null);

  // mutation完了時にtogglingMovieIdをリセット
  useEffect(() => {
    if (!isAdding && !isRemoving) {
      setTogglingMovieId(null);
    }
  }, [isAdding, isRemoving]);

  // ref化して toggleWatchlist の参照を安定させる
  const isInWatchlistRef = useRef(isInWatchlist);
  isInWatchlistRef.current = isInWatchlist;

  const getWatchlistIdRef = useRef(getWatchlistId);
  getWatchlistIdRef.current = getWatchlistId;

  const addToWatchlistRef = useRef(addToWatchlist);
  addToWatchlistRef.current = addToWatchlist;

  const removeFromWatchlistRef = useRef(removeFromWatchlist);
  removeFromWatchlistRef.current = removeFromWatchlist;

  const toastRef = useRef(toast);
  toastRef.current = toast;

  const toggleWatchlist = useCallback(
    (movie: WatchlistToggleMovie) => {
      setTogglingMovieId(movie.id);

      if (isInWatchlistRef.current(movie.id)) {
        const watchlistId = getWatchlistIdRef.current(movie.id);
        if (watchlistId) {
          removeFromWatchlistRef.current(watchlistId);
          toastRef.current({
            title: WATCHLIST_SUCCESS_MESSAGES.REMOVED,
            variant: 'success',
          });
        }
      } else {
        addToWatchlistRef.current({
          tmdb_movie_id: movie.id,
          title: movie.title,
          poster_path: movie.poster_path,
          release_date: movie.release_date,
        });
        toastRef.current({
          title: WATCHLIST_SUCCESS_MESSAGES.ADDED,
          variant: 'success',
        });
      }
    },
    [],
  );

  return useMemo(
    () => ({
      isInWatchlist,
      toggleWatchlist,
      isToggling: isAdding || isRemoving,
      togglingMovieId,
    }),
    [isInWatchlist, toggleWatchlist, isAdding, isRemoving, togglingMovieId],
  );
}
