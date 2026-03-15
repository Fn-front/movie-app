/**
 * RecommendationSectionコンポーネント
 * AIレコメンド映画のセクション表示
 */

'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import { MovieTile } from '@/components/ui/movie/movieTile/movieTile';
import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { RECOMMENDATIONS_MESSAGES } from '@/constants';
import { useRecommendations } from '@/features/recommendations/hooks/useRecommendations';
import { toMovieCacheItem } from '@/features/recommendations/utils/toMovieCacheItem';

import styles from './recommendationSection.module.scss';

/**
 * RecommendationSectionコンポーネント
 */
export const RecommendationSection = memo(function RecommendationSection() {
  const { recommendations, hasFavorites, isLoading, isError } =
    useRecommendations();
  const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);

  const handleMovieClick = useCallback((movieId: number) => {
    setSelectedMovieId(movieId);
  }, []);

  const handleModalClose = useCallback(() => {
    setSelectedMovieId(null);
  }, []);

  const movieCacheItems = useMemo(
    () => recommendations.map(toMovieCacheItem),
    [recommendations],
  );

  const reasonMap = useMemo(
    () => new Map(recommendations.map((r) => [r.tmdb_movie_id, r.reason])),
    [recommendations],
  );

  if (isLoading) {
    return null;
  }

  if (isError) {
    return null;
  }

  // お気に入り0件 → 登録促進テキスト
  if (!hasFavorites) {
    return (
      <section
        aria-label={RECOMMENDATIONS_MESSAGES.SECTION_TITLE}
        className={styles.c_recommendation_section}
      >
        <h2 className={styles.c_recommendation_section__title}>
          {RECOMMENDATIONS_MESSAGES.SECTION_TITLE}
        </h2>
        <p className={styles.c_recommendation_section__message}>
          {RECOMMENDATIONS_MESSAGES.NO_FAVORITES}
        </p>
      </section>
    );
  }

  // レコメンド未生成 → 「準備中」テキスト
  if (recommendations.length === 0) {
    return (
      <section
        aria-label={RECOMMENDATIONS_MESSAGES.SECTION_TITLE}
        className={styles.c_recommendation_section}
      >
        <h2 className={styles.c_recommendation_section__title}>
          {RECOMMENDATIONS_MESSAGES.SECTION_TITLE}
        </h2>
        <p className={styles.c_recommendation_section__message}>
          {RECOMMENDATIONS_MESSAGES.NOT_GENERATED}
        </p>
      </section>
    );
  }

  // レコメンドあり → MovieTileグリッド表示
  return (
    <>
      <section
        aria-label={RECOMMENDATIONS_MESSAGES.SECTION_TITLE}
        className={styles.c_recommendation_section}
      >
        <h2 className={styles.c_recommendation_section__title}>
          {RECOMMENDATIONS_MESSAGES.SECTION_TITLE}
        </h2>
        <div className={styles.c_recommendation_section__grid} role='list'>
          {movieCacheItems.map((movie) => (
            <div
              key={movie.id}
              role='listitem'
              className={styles.c_recommendation_section__item}
            >
              <MovieTile movie={movie} onClick={handleMovieClick} />
              <p className={styles.c_recommendation_section__reason}>
                {reasonMap.get(movie.id)}
              </p>
            </div>
          ))}
        </div>
      </section>
      <MovieDetailModal movieId={selectedMovieId} onClose={handleModalClose} />
    </>
  );
});

RecommendationSection.displayName = 'RecommendationSection';
