/**
 * MovieDetailContentコンポーネント
 * 映画詳細モーダルの内容部分
 */

'use client';

import { memo, useMemo } from 'react';
import Image from 'next/image';

import { Loading } from '@/components/ui/loading/loading';
import { getTMDbPosterUrl, getTMDbBackdropUrl } from '@/utils/image';
import { formatDate } from '@/utils/date';
import { useMovieDetail } from '@/features/movies/hooks/useMovieDetail';

import styles from './movieDetailContent.module.scss';

/**
 * MovieDetailContentコンポーネントのプロパティ
 */
export interface MovieDetailContentProps {
  /** 映画ID */
  movieId: number;
}

/**
 * 上映時間をフォーマット
 */
function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}分`;
  return `${hours}時間${mins}分`;
}

/**
 * MovieDetailContentコンポーネント
 */
export const MovieDetailContent = memo<MovieDetailContentProps>(
  function MovieDetailContent({ movieId }) {
    const { movie, isLoading, isError } = useMovieDetail(movieId);

    const posterUrl = useMemo(
      () => getTMDbPosterUrl(movie?.poster_path),
      [movie?.poster_path],
    );

    const backdropUrl = useMemo(
      () => getTMDbBackdropUrl(movie?.backdrop_path),
      [movie?.backdrop_path],
    );

    const formattedDate = useMemo(
      () => formatDate(movie?.release_date),
      [movie?.release_date],
    );

    const runtime = movie?.runtime ?? null;
    const formattedRuntime = useMemo(
      () => (runtime ? formatRuntime(runtime) : null),
      [runtime],
    );

    if (isLoading) {
      return (
        <div className={styles.c_movie_detail__loading}>
          <Loading size='md' label='読み込み中...' />
        </div>
      );
    }

    if (isError || !movie) {
      return (
        <div className={styles.c_movie_detail__error}>
          <p className={styles.c_movie_detail__error_text}>
            映画情報の取得に失敗しました。
          </p>
        </div>
      );
    }

    return (
      <div className={styles.c_movie_detail}>
        {backdropUrl && (
          <div className={styles.c_movie_detail__backdrop}>
            <Image
              src={backdropUrl}
              alt=''
              fill
              sizes='(max-width: 900px) 100vw, 900px'
              className={styles.c_movie_detail__backdrop_image}
            />
            <div className={styles.c_movie_detail__backdrop_overlay} />
          </div>
        )}

        <div className={styles.c_movie_detail__body}>
          <div className={styles.c_movie_detail__main}>
            {posterUrl && (
              <div className={styles.c_movie_detail__poster}>
                <Image
                  src={posterUrl}
                  alt={`${movie.title}のポスター`}
                  width={200}
                  height={300}
                  className={styles.c_movie_detail__poster_image}
                />
              </div>
            )}

            <div className={styles.c_movie_detail__info}>
              <h3 className={styles.c_movie_detail__title}>{movie.title}</h3>
              {movie.original_title !== movie.title && (
                <p className={styles.c_movie_detail__original_title}>
                  {movie.original_title}
                </p>
              )}

              <div className={styles.c_movie_detail__meta}>
                {formattedDate && (
                  <span className={styles.c_movie_detail__meta_item}>
                    {formattedDate}
                  </span>
                )}
                {formattedRuntime && (
                  <span className={styles.c_movie_detail__meta_item}>
                    {formattedRuntime}
                  </span>
                )}
                {movie.vote_average > 0 && (
                  <span className={styles.c_movie_detail__rating}>
                    {movie.vote_average.toFixed(1)}
                  </span>
                )}
              </div>

              {movie.genres.length > 0 && (
                <div className={styles.c_movie_detail__genres}>
                  {movie.genres.map((genre) => (
                    <span
                      key={genre.id}
                      className={styles.c_movie_detail__genre_tag}
                    >
                      {genre.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {movie.overview && (
            <div className={styles.c_movie_detail__overview}>
              <h4 className={styles.c_movie_detail__section_title}>あらすじ</h4>
              <p className={styles.c_movie_detail__overview_text}>
                {movie.overview}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  },
);

MovieDetailContent.displayName = 'MovieDetailContent';
