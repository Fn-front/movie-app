/**
 * RecommendationSectionコンポーネント
 * AIレコメンド映画のセクション表示
 */

'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import { MovieTile } from '@/components/ui/movie/movieTile/movieTile';
import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { FavoriteRatingModal } from '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal';
import { useFavoriteToggle } from '@/features/favorites/hooks/useFavoriteToggle';
import { useWatchlistToggle } from '@/features/watchlist/hooks/useWatchlistToggle';
import { useDismissMovie } from '@/features/dismissedMovies/hooks/useDismissMovie';
import { RECOMMENDATIONS_MESSAGES } from '@/constants';
import type { MovieCacheItem } from '@/lib/api/movies/movies';
import type { Recommendation } from '@/schema/recommendations';
import { toMovieCacheItem } from '@/features/recommendations/utils/toMovieCacheItem';

import styles from './recommendationSection.module.scss';

/**
 * RecommendationSectionコンポーネントのプロパティ
 */
export interface RecommendationSectionProps {
  /** レコメンド一覧 */
  recommendations: Recommendation[];
  /** お気に入りが1件以上あるか */
  hasFavorites: boolean;
}

/**
 * RecommendationSectionコンポーネント
 */
export const RecommendationSection = memo<RecommendationSectionProps>(
  function RecommendationSection({ recommendations, hasFavorites }) {
    const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);

    const {
      modalState: favoriteModalState,
      handleFavoriteToggle,
      closeModal: closeFavoriteModal,
      handleModalSubmit: handleFavoriteModalSubmit,
      handleDelete: handleFavoriteDelete,
      isFavoriteProcessing,
      getFavoriteInfo,
    } = useFavoriteToggle();

    const { isInWatchlist, toggleWatchlist, isMovieToggling } =
      useWatchlistToggle();

    const { dismissMovie, isDismissingMovie, dismissedIds } = useDismissMovie();

    const handleDismiss = useCallback(
      (movie: MovieCacheItem) => {
        dismissMovie({
          tmdb_movie_id: movie.id,
          title: movie.title,
          poster_path: movie.poster_path ?? null,
          genre_ids: movie.genre_ids ?? null,
        });
      },
      [dismissMovie],
    );

    const handleMovieClick = useCallback((movieId: number) => {
      setSelectedMovieId(movieId);
    }, []);

    const handleModalClose = useCallback(() => {
      setSelectedMovieId(null);
    }, []);

    const movieCacheItems = useMemo(
      () =>
        recommendations
          .filter((rec) => !dismissedIds.has(rec.tmdb_movie_id))
          .map((rec) => ({
            ...toMovieCacheItem(rec),
            favorite: getFavoriteInfo(rec.tmdb_movie_id),
          })),
      [recommendations, getFavoriteInfo, dismissedIds],
    );

    const selectedMovieTitle = useMemo(
      () =>
        movieCacheItems.find((movie) => movie.id === selectedMovieId)?.title,
      [movieCacheItems, selectedMovieId],
    );

    const reasonMap = useMemo(
      () => new Map(recommendations.map((r) => [r.tmdb_movie_id, r.reason])),
      [recommendations],
    );

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
                <MovieTile
                  movie={movie}
                  onClick={handleMovieClick}
                  isInWatchlist={isInWatchlist(movie.id)}
                  onWatchlistToggle={toggleWatchlist}
                  watchlistDisabled={isMovieToggling(movie.id)}
                  onFavoriteToggle={handleFavoriteToggle}
                  favoriteDisabled={isFavoriteProcessing(movie.id)}
                  onDismiss={handleDismiss}
                  dismissDisabled={
                    isDismissingMovie(movie.id) || !!movie.favorite
                  }
                />
                <p className={styles.c_recommendation_section__reason}>
                  {reasonMap.get(movie.id)}
                </p>
              </div>
            ))}
          </div>
        </section>
        <MovieDetailModal
          movieId={selectedMovieId}
          title={selectedMovieTitle}
          onClose={handleModalClose}
        />
        <FavoriteRatingModal
          isOpen={favoriteModalState.isOpen}
          onClose={closeFavoriteModal}
          movieTitle={favoriteModalState.movie?.title ?? ''}
          currentFavorite={favoriteModalState.currentFavorite}
          onSubmit={handleFavoriteModalSubmit}
          onDelete={handleFavoriteDelete}
        />
      </>
    );
  },
);

RecommendationSection.displayName = 'RecommendationSection';
