/**
 * 興味なし映画追加 カスタムフック
 * レコメンドカードから映画をdismissする
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { addDismissedMovie } from '@/lib/api/dismissedMovies/dismissedMovies';
import { useToast } from '@/hooks/useToast';
import {
  DISMISSED_MOVIES_SUCCESS_MESSAGES,
  DISMISSED_MOVIES_ERROR_MESSAGES,
} from '@/constants';

/**
 * dismiss対象の映画データ
 */
interface DismissMovieData {
  tmdb_movie_id: number;
  title: string;
  poster_path: string | null;
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
const DISMISSED_MOVIES_QUERY_KEY = ['dismissed-movies'];

export function useDismissMovie(): UseDismissMovieReturn {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const dismissingIdRef = useRef<number | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  const mutation = useMutation({
    mutationFn: (data: DismissMovieData) =>
      addDismissedMovie({
        tmdb_movie_id: data.tmdb_movie_id,
        title: data.title,
        poster_path: data.poster_path,
        genre_ids: data.genre_ids,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DISMISSED_MOVIES_QUERY_KEY });
      toast({
        title: DISMISSED_MOVIES_SUCCESS_MESSAGES.ADDED,
        variant: 'success',
      });
    },
    onError: (_error, variables) => {
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.tmdb_movie_id);
        return next;
      });
      toast({
        title: DISMISSED_MOVIES_ERROR_MESSAGES.ADD_FAILED,
        variant: 'error',
      });
    },
  });

  const dismissMovie = useCallback(
    (movie: DismissMovieData) => {
      dismissingIdRef.current = movie.tmdb_movie_id;
      setDismissedIds((prev) => new Set([...prev, movie.tmdb_movie_id]));
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
      dismissedIds,
    }),
    [dismissMovie, mutation.isPending, isDismissingMovie, dismissedIds],
  );
}
