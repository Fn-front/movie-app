/**
 * TrendingMovieListコンポーネント
 * トレンド映画の横スクロールリスト
 */

'use client';

import { memo, useCallback, useState } from 'react';

import { Loading } from '@/components/ui/loading/loading';
import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { TRENDING_SECTION_TITLE, TRENDING_ERROR_MESSAGES } from '@/constants';
import { useTrendingMovies } from '@/features/trending/hooks/useTrendingMovies';
import { TrendingMovieCard } from '@/features/trending/component/trendingMovieCard/trendingMovieCard';

import styles from './trendingMovieList.module.scss';

/**
 * TrendingMovieListコンポーネント
 */
export const TrendingMovieList = memo(function TrendingMovieList() {
  const { trendingMovies, isLoading, isError } = useTrendingMovies();
  const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);

  const handleMovieClick = useCallback((movieId: number) => {
    setSelectedMovieId(movieId);
  }, []);

  const handleModalClose = useCallback(() => {
    setSelectedMovieId(null);
  }, []);

  if (isLoading) {
    return (
      <section aria-label={TRENDING_SECTION_TITLE}>
        <div className={styles.c_trending_movie_list__header}>
          <h2 className={styles.c_trending_movie_list__title}>
            {TRENDING_SECTION_TITLE}
          </h2>
        </div>
        <div className={styles.c_trending_movie_list__loading}>
          <Loading size='sm' label='読み込み中...' />
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section aria-label={TRENDING_SECTION_TITLE}>
        <div className={styles.c_trending_movie_list__header}>
          <h2 className={styles.c_trending_movie_list__title}>
            {TRENDING_SECTION_TITLE}
          </h2>
        </div>
        <p className={styles.c_trending_movie_list__error}>
          {TRENDING_ERROR_MESSAGES.FETCH_FAILED}
        </p>
      </section>
    );
  }

  if (trendingMovies.length === 0) {
    return (
      <section aria-label={TRENDING_SECTION_TITLE}>
        <div className={styles.c_trending_movie_list__header}>
          <h2 className={styles.c_trending_movie_list__title}>
            {TRENDING_SECTION_TITLE}
          </h2>
        </div>
        <p className={styles.c_trending_movie_list__empty}>
          トレンド映画データがありません
        </p>
      </section>
    );
  }

  return (
    <>
      <section aria-label={TRENDING_SECTION_TITLE}>
        <div className={styles.c_trending_movie_list__header}>
          <h2 className={styles.c_trending_movie_list__title}>
            {TRENDING_SECTION_TITLE}
          </h2>
        </div>
        <div className={styles.c_trending_movie_list__scroll_container}>
          <div className={styles.c_trending_movie_list__list} role='list'>
            {trendingMovies.map((movie) => (
              <div key={movie.id} role='listitem'>
                <TrendingMovieCard
                  movie={movie}
                  onClick={handleMovieClick}
                />
              </div>
            ))}
          </div>
        </div>
      </section>
      <MovieDetailModal
        movieId={selectedMovieId}
        onClose={handleModalClose}
      />
    </>
  );
});

TrendingMovieList.displayName = 'TrendingMovieList';
