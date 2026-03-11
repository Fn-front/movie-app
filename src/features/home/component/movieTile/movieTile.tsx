/**
 * MovieTileコンポーネント
 * 映画一覧のタイルアイテム
 */

'use client';

import { memo, useCallback, useMemo } from 'react';
import Image from 'next/image';

import { Card } from '@/components/ui/card/card';
import { WatchlistAddButton } from '@/features/watchlist/component/watchlistAddButton/watchlistAddButton';
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
  /** ジャンルマップ */
  genres?: Record<number, string>;
  /** クリック時のコールバック */
  onClick?: (movieId: number) => void;
  /** ウォッチリストに追加済みかどうか */
  isInWatchlist?: boolean;
  /** ウォッチリストボタンクリック時のコールバック */
  onWatchlistToggle?: (movie: MovieCacheItem) => void;
  /** ウォッチリストボタン無効化 */
  watchlistDisabled?: boolean;
}

/**
 * MovieTileコンポーネント
 */
export const MovieTile = memo<MovieTileProps>(function MovieTile({
  movie,
  genres,
  onClick,
  isInWatchlist = false,
  onWatchlistToggle,
  watchlistDisabled = false,
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

  const handleWatchlistToggle = useCallback(() => {
    onWatchlistToggle?.(movie);
  }, [movie, onWatchlistToggle]);

  const posterUrl = getTMDbPosterUrl(movie.poster_path);
  const formattedDate = movie.release_date
    ? formatDate(movie.release_date)
    : null;

  const ratingClassName = useMemo(() => {
    if (movie.vote_average == null || movie.vote_average <= 0) return '';
    if (movie.vote_average >= 7) return styles.c_movie_tile__rating__high;
    if (movie.vote_average >= 5) return styles.c_movie_tile__rating__mid;
    return styles.c_movie_tile__rating__low;
  }, [movie.vote_average]);

  const genreNames = useMemo(() => {
    if (!genres || !movie.genre_ids || movie.genre_ids.length === 0) {
      return [];
    }
    return movie.genre_ids
      .slice(0, 2)
      .map((id) => genres[id])
      .filter(Boolean);
  }, [genres, movie.genre_ids]);

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
        {movie.is_revival && (
          <span className={styles.c_movie_tile__revival}>リバイバル</span>
        )}
        {onWatchlistToggle && (
          <div className={styles.c_movie_tile__watchlist_button}>
            <WatchlistAddButton
              isInWatchlist={isInWatchlist}
              onClick={handleWatchlistToggle}
              disabled={watchlistDisabled}
            />
          </div>
        )}
      </div>
      <div className={styles.c_movie_tile__info}>
        <h3 className={styles.c_movie_tile__title}>{movie.title}</h3>
        {genreNames.length > 0 && (
          <div className={styles.c_movie_tile__genres}>
            {genreNames.map((name) => (
              <span key={name} className={styles.c_movie_tile__genre_tag}>
                {name}
              </span>
            ))}
          </div>
        )}
        <div className={styles.c_movie_tile__footer}>
          {formattedDate && (
            <p className={styles.c_movie_tile__date}>{formattedDate}</p>
          )}
          {movie.vote_average != null && movie.vote_average > 0 && (
            <span
              className={`${styles.c_movie_tile__rating} ${ratingClassName}`}
            >
              {movie.vote_average.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
});

MovieTile.displayName = 'MovieTile';
