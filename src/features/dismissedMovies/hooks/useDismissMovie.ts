/**
 * 興味なし映画追加 カスタムフック
 * レコメンドカードから映画をdismissする
 */

import { useCallback, useMemo, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';

import { addDismissedMovie } from '@/lib/api/dismissedMovies/dismissedMovies';
import { useToast } from '@/hooks/useToast';
import { DISMISSED_MOVIES_SUCCESS_MESSAGES } from '@/constants';

/**
 * dismiss対象の映画データ
 */
interface DismissMovieData {
  tmdb_movie_id: number;
  title: string;
  genre_ids: number[] | null;
}

/**
 * useDismissMovieフックの返り値
 */
export interface UseDismissMovieReturn {
  /** 映画をdismissする */
  dismissMovie: (movie: DismissMovieData) => void;
  /** dismiss処理中かどうか */
  isDismissing: boolean;
  /** 指定映画がdismiss処理中かどうか */
  isDismissingMovie: (tmdbMovieId: number) => boolean;
  /** dismissされた映画IDのセット */
  dismissedIds: Set<number>;
}

/**
 * 興味なし映画追加フック
 */
export function useDismissMovie(): UseDismissMovieReturn {
  const { toast } = useToast();
  const dismissingIdRef = useRef<number | null>(null);
  const dismissedIdsRef = useRef<Set<number>>(new Set());

  const mutation = useMutation({
    mutationFn: (data: DismissMovieData) =>
      addDismissedMovie({
        tmdb_movie_id: data.tmdb_movie_id,
        title: data.title,
        genre_ids: data.genre_ids,
      }),
    onSuccess: () => {
      toast({
        title: DISMISSED_MOVIES_SUCCESS_MESSAGES.ADDED,
        variant: 'success',
      });
    },
  });

  const dismissMovie = useCallback(
    (movie: DismissMovieData) => {
      dismissingIdRef.current = movie.tmdb_movie_id;
      dismissedIdsRef.current = new Set([
        ...dismissedIdsRef.current,
        movie.tmdb_movie_id,
      ]);
      mutation.mutate(movie);
    },
    [mutation],
  );

  const isDismissingMovie = useCallback(
    (tmdbMovieId: number) =>
      mutation.isPending && dismissingIdRef.current === tmdbMovieId,
    [mutation.isPending],
  );

  return useMemo(
    () => ({
      dismissMovie,
      isDismissing: mutation.isPending,
      isDismissingMovie,
      dismissedIds: dismissedIdsRef.current,
    }),
    [dismissMovie, mutation.isPending, isDismissingMovie],
  );
}
