/**
 * NowShowingMovieListコンポーネント
 * 劇場公開中の人気映画の横スクロールリスト
 */

'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import { Loading } from '@/components/ui/loading/loading';
import { MovieTile } from '@/components/ui/movie/movieTile/movieTile';
import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import {
  NOW_SHOWING_SECTION_TITLE,
  NOW_SHOWING_ERROR_MESSAGES,
} from '@/constants';
import { useNowShowingMovies } from '@/features/nowShowing/hooks/useNowShowingMovies';
import { toMovieCacheItem } from '@/features/nowShowing/utils/toMovieCacheItem';

import styles from './nowShowingMovieList.module.scss';

/**
 * NowShowingMovieListコンポーネント
 */
export const NowShowingMovieList = memo(function NowShowingMovieList() {
  const { nowShowingMovies, isLoading, isError } = useNowShowingMovies();
  const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);

  const handleMovieClick = useCallback((movieId: number) => {
    setSelectedMovieId(movieId);
  }, []);

  const handleModalClose = useCallback(() => {
    setSelectedMovieId(null);
  }, []);

  const movieCacheItems = useMemo(
    () => nowShowingMovies.map(toMovieCacheItem),
    [nowShowingMovies],
  );

  if (isLoading) {
    return (
      <section aria-label={NOW_SHOWING_SECTION_TITLE}>
        <div className={styles.c_now_showing_movie_list__header}>
          <h2 className={styles.c_now_showing_movie_list__title}>
            {NOW_SHOWING_SECTION_TITLE}
          </h2>
        </div>
        <div className={styles.c_now_showing_movie_list__loading}>
          <Loading size='sm' label='読み込み中...' />
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section aria-label={NOW_SHOWING_SECTION_TITLE}>
        <div className={styles.c_now_showing_movie_list__header}>
          <h2 className={styles.c_now_showing_movie_list__title}>
            {NOW_SHOWING_SECTION_TITLE}
          </h2>
        </div>
        <p className={styles.c_now_showing_movie_list__error}>
          {NOW_SHOWING_ERROR_MESSAGES.FETCH_FAILED}
        </p>
      </section>
    );
  }

  if (nowShowingMovies.length === 0) {
    return (
      <section aria-label={NOW_SHOWING_SECTION_TITLE}>
        <div className={styles.c_now_showing_movie_list__header}>
          <h2 className={styles.c_now_showing_movie_list__title}>
            {NOW_SHOWING_SECTION_TITLE}
          </h2>
        </div>
        <p className={styles.c_now_showing_movie_list__empty}>
          劇場公開中の人気映画データがありません
        </p>
      </section>
    );
  }

  return (
    <>
      <section aria-label={NOW_SHOWING_SECTION_TITLE}>
        <div className={styles.c_now_showing_movie_list__header}>
          <h2 className={styles.c_now_showing_movie_list__title}>
            {NOW_SHOWING_SECTION_TITLE}
          </h2>
        </div>
        <div className={styles.c_now_showing_movie_list__scroll_container}>
          <div className={styles.c_now_showing_movie_list__list} role='list'>
            {movieCacheItems.map((movie, index) => (
              <div
                key={movie.id}
                role='listitem'
                className={styles.c_now_showing_movie_list__item}
              >
                <span className={styles.c_now_showing_movie_list__rank}>
                  {index + 1}
                </span>
                <MovieTile movie={movie} onClick={handleMovieClick} />
              </div>
            ))}
          </div>
        </div>
      </section>
      <MovieDetailModal movieId={selectedMovieId} onClose={handleModalClose} />
    </>
  );
});

NowShowingMovieList.displayName = 'NowShowingMovieList';
