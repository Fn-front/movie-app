/**
 * TrendingMovieCardコンポーネント
 * トレンド映画カード（ポスター、順位、タイトル、評価表示）
 */

'use client';

import { memo, useCallback, useMemo } from 'react';
import Image from 'next/image';

import { getTMDbPosterUrl } from '@/utils/image';
import type { TrendingMovie } from '@/lib/types';

import styles from './trendingMovieCard.module.scss';

/**
 * TrendingMovieCardコンポーネントのプロパティ
 */
export interface TrendingMovieCardProps {
  /** トレンド映画データ */
  movie: TrendingMovie;
  /** クリック時のコールバック */
  onClick?: (movieId: number) => void;
}

/**
 * TrendingMovieCardコンポーネント
 */
export const TrendingMovieCard = memo<TrendingMovieCardProps>(
  function TrendingMovieCard({ movie, onClick }) {
    const handleClick = useCallback(() => {
      onClick?.(movie.tmdb_movie_id);
    }, [movie.tmdb_movie_id, onClick]);

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.(movie.tmdb_movie_id);
        }
      },
      [movie.tmdb_movie_id, onClick],
    );

    const posterUrl = getTMDbPosterUrl(movie.poster_path);

    const ratingClassName = useMemo(() => {
      if (movie.vote_average == null || movie.vote_average <= 0) return '';
      if (movie.vote_average >= 7)
        return styles.c_trending_movie_card__rating__high;
      if (movie.vote_average >= 5)
        return styles.c_trending_movie_card__rating__mid;
      return styles.c_trending_movie_card__rating__low;
    }, [movie.vote_average]);

    return (
      <div
        className={styles.c_trending_movie_card}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role='button'
        tabIndex={0}
        aria-label={`${movie.title}の詳細を表示`}
      >
        <div className={styles.c_trending_movie_card__poster}>
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={`${movie.title}のポスター`}
              width={180}
              height={270}
              className={styles.c_trending_movie_card__image}
            />
          ) : (
            <div className={styles.c_trending_movie_card__no_image}>
              No Image
            </div>
          )}
          <span className={styles.c_trending_movie_card__rank}>
            {movie.display_order}
          </span>
        </div>
        <div className={styles.c_trending_movie_card__info}>
          <h3 className={styles.c_trending_movie_card__title}>{movie.title}</h3>
          <div className={styles.c_trending_movie_card__meta}>
            {movie.vote_average != null && movie.vote_average > 0 && (
              <span
                className={`${styles.c_trending_movie_card__rating} ${ratingClassName}`}
              >
                {movie.vote_average.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  },
);

TrendingMovieCard.displayName = 'TrendingMovieCard';
