/**
 * 興味なし映画一覧コンポーネント（設定ページ用）
 */

'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IoClose } from 'react-icons/io5';
import Image from 'next/image';

import {
  getDismissedMovies,
  removeDismissedMovie,
} from '@/lib/api/dismissedMovies/dismissedMovies';
import type { DismissedMovieItem } from '@/lib/api/dismissedMovies/dismissedMovies';
import { EmptyState } from '@/components/ui/emptyState/emptyState';
import { Loading } from '@/components/ui/loading/loading';
import { useToast } from '@/hooks/useToast';
import { getTMDbImageUrl } from '@/utils/image';
import {
  DISMISSED_MOVIES_SUCCESS_MESSAGES,
  DISMISSED_MOVIES_ERROR_MESSAGES,
  IMAGE_SIZES,
  DISPLAY_LIMITS,
  EMPTY_MESSAGES,
} from '@/constants';

import styles from './dismissedMoviesList.module.scss';

const QUERY_KEY = ['dismissed-movies'];
const INITIAL_DISPLAY_COUNT = DISPLAY_LIMITS.DISMISSED_INITIAL;

/**
 * 興味なし映画一覧
 */
export const DismissedMoviesList = memo(function DismissedMoviesList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: movies = [], isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getDismissedMovies,
  });

  const removeMutation = useMutation({
    mutationFn: removeDismissedMovie,
    onMutate: async (tmdbMovieId: number) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous =
        queryClient.getQueryData<DismissedMovieItem[]>(QUERY_KEY);
      queryClient.setQueryData<DismissedMovieItem[]>(QUERY_KEY, (old) =>
        (old ?? []).filter((m) => m.tmdb_movie_id !== tmdbMovieId),
      );
      return { previous };
    },
    onSuccess: () => {
      toast({
        title: DISMISSED_MOVIES_SUCCESS_MESSAGES.REMOVED,
        variant: 'success',
      });
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
      toast({
        title: DISMISSED_MOVIES_ERROR_MESSAGES.REMOVE_FAILED,
        variant: 'error',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const [isExpanded, setIsExpanded] = useState(false);

  const handleRemove = useCallback(
    (tmdbMovieId: number) => {
      removeMutation.mutate(tmdbMovieId);
    },
    [removeMutation],
  );

  const displayedMovies = useMemo(
    () => (isExpanded ? movies : movies.slice(0, INITIAL_DISPLAY_COUNT)),
    [movies, isExpanded],
  );

  const hasMore = movies.length > INITIAL_DISPLAY_COUNT;

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  if (isLoading) {
    return (
      <div className={styles.c_dismissed_movies_list__loading}>
        <Loading size='sm' />
      </div>
    );
  }

  if (movies.length === 0) {
    return <EmptyState title={EMPTY_MESSAGES.DISMISSED} />;
  }

  return (
    <div className={styles.c_dismissed_movies_list}>
      <p className={styles.c_dismissed_movies_list__count}>
        {movies.length}件登録中
      </p>
      {displayedMovies.map((movie) => (
        <DismissedMovieItem
          key={movie.id}
          movie={movie}
          onRemove={handleRemove}
          isRemoving={removeMutation.isPending}
        />
      ))}
      {hasMore && (
        <button
          type='button'
          className={styles.c_dismissed_movies_list__toggle}
          onClick={handleToggleExpand}
        >
          {isExpanded
            ? '折りたたむ'
            : `すべて表示（残り${movies.length - INITIAL_DISPLAY_COUNT}件）`}
        </button>
      )}
    </div>
  );
});

DismissedMoviesList.displayName = 'DismissedMoviesList';

/**
 * 興味なし映画アイテム
 */
interface DismissedMovieItemProps {
  movie: DismissedMovieItem;
  onRemove: (tmdbMovieId: number) => void;
  isRemoving: boolean;
}

const DismissedMovieItem = memo<DismissedMovieItemProps>(
  function DismissedMovieItem({ movie, onRemove, isRemoving }) {
    const handleRemove = useCallback(() => {
      onRemove(movie.tmdb_movie_id);
    }, [onRemove, movie.tmdb_movie_id]);

    const posterUrl = getTMDbImageUrl(movie.poster_path, 'w92');

    return (
      <div className={styles.c_dismissed_movies_list__item}>
        <div className={styles.c_dismissed_movies_list__poster}>
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={movie.title}
              width={IMAGE_SIZES.THUMBNAIL.WIDTH}
              height={IMAGE_SIZES.THUMBNAIL.HEIGHT}
              unoptimized
            />
          ) : (
            '🎬'
          )}
        </div>
        <div className={styles.c_dismissed_movies_list__info}>
          <span className={styles.c_dismissed_movies_list__title}>
            {movie.title}
          </span>
        </div>
        <button
          type='button'
          className={styles.c_dismissed_movies_list__remove_button}
          onClick={handleRemove}
          disabled={isRemoving}
          aria-label={`${movie.title}の興味なしを解除`}
        >
          <IoClose />
        </button>
      </div>
    );
  },
);

DismissedMovieItem.displayName = 'DismissedMovieItem';
