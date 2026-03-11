/**
 * ウォッチリスト追加/削除トグル カスタムフック
 * useWatchlist + useToast を統合し、トグルロジックを一元管理
 */

import { useCallback, useMemo } from 'react';

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

  const toggleWatchlist = useCallback(
    (movie: WatchlistToggleMovie) => {
      if (isInWatchlist(movie.id)) {
        const watchlistId = getWatchlistId(movie.id);
        if (watchlistId) {
          removeFromWatchlist(watchlistId);
          toast({
            title: 'ウォッチリストから削除しました',
            variant: 'success',
          });
        }
      } else {
        addToWatchlist({
          tmdb_movie_id: movie.id,
          title: movie.title,
          poster_path: movie.poster_path,
          release_date: movie.release_date,
        });
        toast({
          title: 'ウォッチリストに追加しました',
          variant: 'success',
        });
      }
    },
    [isInWatchlist, getWatchlistId, addToWatchlist, removeFromWatchlist, toast],
  );

  return useMemo(
    () => ({
      isInWatchlist,
      toggleWatchlist,
      isToggling: isAdding || isRemoving,
    }),
    [isInWatchlist, toggleWatchlist, isAdding, isRemoving],
  );
}
