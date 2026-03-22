/**
 * 受賞作品ページ メインコンポーネント
 */

'use client';

import { memo, useMemo } from 'react';

import { Loading } from '@/components/ui/loading/loading';
import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { FavoriteRatingModal } from '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal';
import { useFavoriteToggle } from '@/features/favorites/hooks/useFavoriteToggle';
import { useWatchlistToggle } from '@/features/watchlist/hooks/useWatchlistToggle';
import { useMovieDetailModal } from '@/hooks/useMovieDetailModal';
import { AWARDS_MESSAGES } from '@/constants';
import { useAwards } from '@/features/awards/hooks/useAwards';
import { AwardYearSelect } from '@/features/awards/awardYearSelect/awardYearSelect';
import { AwardSection } from '@/features/awards/awardSection/awardSection';
import { awardMovieToMovieCacheItem } from '@/utils/toMovieCacheItem';

import styles from './awardsPage.module.scss';

export const AwardsPage = memo(function AwardsPage() {
  const { data, isLoading, isError, selectedYear, handleYearChange } =
    useAwards();

  const {
    modalState: favoriteModalState,
    handleFavoriteToggle,
    closeModal: closeFavoriteModal,
    handleModalSubmit: handleFavoriteModalSubmit,
    handleDelete: handleFavoriteDelete,
    isFavoriteProcessing,
  } = useFavoriteToggle();

  const { isInWatchlist, toggleWatchlist, isMovieToggling } =
    useWatchlistToggle();

  const awards = data?.awards;

  const allMovieCacheItems = useMemo(() => {
    if (!awards) return [];
    return awards.flatMap((award) =>
      award.categories.flatMap((cat) =>
        cat.nominees.map(awardMovieToMovieCacheItem),
      ),
    );
  }, [awards]);

  const uniqueMovieCacheItems = useMemo(() => {
    const seen = new Set<number>();
    return allMovieCacheItems.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [allMovieCacheItems]);

  const {
    selectedMovieId,
    selectedMovieTitle,
    handleMovieClick,
    handleModalClose,
  } = useMovieDetailModal(uniqueMovieCacheItems);

  if (isLoading) {
    return (
      <div className={styles.c_awards_page}>
        <div className={styles.c_awards_page__toolbar}>
          <h2 className={styles.c_awards_page__title}>
            {AWARDS_MESSAGES.PAGE_TITLE}
          </h2>
        </div>
        <div className={styles.c_awards_page__loading}>
          <Loading size='md' />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.c_awards_page}>
        <div className={styles.c_awards_page__toolbar}>
          <h2 className={styles.c_awards_page__title}>
            {AWARDS_MESSAGES.PAGE_TITLE}
          </h2>
        </div>
        <p className={styles.c_awards_page__message}>
          {AWARDS_MESSAGES.FETCH_ERROR}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.c_awards_page}>
        <div className={styles.c_awards_page__toolbar}>
          <h2 className={styles.c_awards_page__title}>
            {AWARDS_MESSAGES.PAGE_TITLE}
          </h2>
          {data && data.availableYears.length > 0 && (
            <div className={styles.c_awards_page__controls}>
              <AwardYearSelect
                availableYears={data.availableYears}
                selectedYear={selectedYear}
                onYearChange={handleYearChange}
                className={styles.c_awards_page__sort}
              />
            </div>
          )}
        </div>

        {data && data.awards.length > 0 ? (
          <div className={styles.c_awards_page__content}>
            {data.awards.map((award) => (
              <AwardSection
                key={award.awardName}
                award={award}
                onMovieClick={handleMovieClick}
                isInWatchlist={isInWatchlist}
                onWatchlistToggle={toggleWatchlist}
                isMovieToggling={isMovieToggling}
                onFavoriteToggle={handleFavoriteToggle}
                isFavoriteProcessing={isFavoriteProcessing}
              />
            ))}
          </div>
        ) : (
          <p className={styles.c_awards_page__message}>
            {AWARDS_MESSAGES.NO_DATA}
          </p>
        )}
      </div>
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
});

AwardsPage.displayName = 'AwardsPage';
