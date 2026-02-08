/**
 * MovieTileコンポーネント
 * 映画一覧のタイルアイテム
 */

'use client';

import { memo, useCallback } from 'react';
import Image from 'next/image';

import { Card } from '@/components/ui/card/card';
import { getTMDbPosterUrl } from '@/utils/image';
import { formatDate } from '@/utils/date';
import type { MovieCacheItem } from '@/lib/api/movies/movies';

import styles from './movieTile.module.scss';

/**
 * MovieTileコンポーネントのプロパティ
 */
export interface MovieTileProps {
  /** 映画データ */
  movie: MovieCacheItem;
  /** クリック時のコールバック */
  onClick?: (movieId: number) => void;
}

/**
 * MovieTileコンポーネント
 */
export const MovieTile = memo<MovieTileProps>(function MovieTile({
  movie,
  onClick,
}) {
  const handleClick = useCallback(() => {
    onClick?.(movie.id);
  }, [movie.id, onClick]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick?.(movie.id);
      }
    },
    [movie.id, onClick],
  );

  const posterUrl = getTMDbPosterUrl(movie.poster_path);
  const formattedDate = movie.release_date
    ? formatDate(movie.release_date)
    : null;

  return (
    <Card
      clickable
      hoverable
      noPadding
      className={styles.c_movie_tile}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role='button'
      tabIndex={0}
      aria-label={`${movie.title}の詳細を表示`}
    >
      <div className={styles.c_movie_tile__poster}>
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={`${movie.title}のポスター`}
            width={500}
            height={750}
            className={styles.c_movie_tile__image}
          />
        ) : (
          <div className={styles.c_movie_tile__no_image}>No Image</div>
        )}
        {movie.vote_average != null && movie.vote_average > 0 && (
          <span className={styles.c_movie_tile__rating}>
            {movie.vote_average.toFixed(1)}
          </span>
        )}
      </div>
      <div className={styles.c_movie_tile__info}>
        <h3 className={styles.c_movie_tile__title}>{movie.title}</h3>
        {formattedDate && (
          <p className={styles.c_movie_tile__date}>{formattedDate}</p>
        )}
      </div>
    </Card>
  );
});

MovieTile.displayName = 'MovieTile';
