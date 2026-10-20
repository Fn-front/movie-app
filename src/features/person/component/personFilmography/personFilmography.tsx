/**
 * PersonFilmographyコンポーネント
 * 人物ページの出演作品一覧
 */

'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import { EmptyState } from '@/components/ui/emptyState/emptyState';
import { MovieGridContainer } from '@/components/ui/movie/movieGridContainer/movieGridContainer';
import { MovieTile } from '@/components/ui/movie/movieTile/movieTile';
import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { Pagination } from '@/components/ui/pagination/pagination';
import { FavoriteRatingModal } from '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal';
import { useFavoriteToggle } from '@/features/favorites/hooks/useFavoriteToggle';
import { useWatchlistToggle } from '@/features/watchlist/hooks/useWatchlistToggle';
import { useMovieDetailModal } from '@/hooks/useMovieDetailModal';
import { PERSON_FILMOGRAPHY_PAGE_SIZE, PERSON_MESSAGES } from '@/constants';
import { personCreditToMovieCacheItem } from '@/utils/toMovieCacheItem';
import type { PersonMovieCredit } from '@/lib/types';

import styles from './personFilmography.module.scss';

/**
 * PersonFilmographyコンポーネントのプロパティ
 */
export interface PersonFilmographyProps {
  /** 出演作品（公開日降順で整形済み） */
  credits: PersonMovieCredit[];
}

/**
 * PersonFilmographyコンポーネント
 */
export const PersonFilmography = memo<PersonFilmographyProps>(
  function PersonFilmography({ credits }) {
    const [currentPage, setCurrentPage] = useState(1);

    const { isInWatchlist, toggleWatchlist, isMovieToggling } =
      useWatchlistToggle();
    const {
      modalState: favoriteModalState,
      handleFavoriteToggle,
      closeModal: closeFavoriteModal,
      handleModalSubmit: handleFavoriteModalSubmit,
      handleDelete: handleFavoriteDelete,
      isFavoriteProcessing,
      getFavoriteInfo,
    } = useFavoriteToggle();

    // TMDb の movie_credits はページングが無く全件を一括で返すため、
    // 表示件数の制御はクライアント側で行う
    const totalPages = Math.max(
      1,
      Math.ceil(credits.length / PERSON_FILMOGRAPHY_PAGE_SIZE),
    );

    const visibleCredits = useMemo(() => {
      const start = (currentPage - 1) * PERSON_FILMOGRAPHY_PAGE_SIZE;
      return credits.slice(start, start + PERSON_FILMOGRAPHY_PAGE_SIZE);
    }, [credits, currentPage]);

    const movieCacheItems = useMemo(
      () =>
        visibleCredits.map((credit) =>
          personCreditToMovieCacheItem(credit, getFavoriteInfo(credit.id)),
        ),
      [visibleCredits, getFavoriteInfo],
    );

    const {
      selectedMovieId,
      selectedMovieTitle,
      handleMovieClick,
      handleModalClose,
    } = useMovieDetailModal(movieCacheItems);

    const handlePageChange = useCallback((page: number) => {
      setCurrentPage(page);
    }, []);

    if (credits.length === 0) {
      return (
        <section className={styles.c_person_filmography}>
          <h2 className={styles.c_person_filmography__heading}>
            {PERSON_MESSAGES.FILMOGRAPHY_HEADING}
          </h2>
          <EmptyState
            title={PERSON_MESSAGES.FILMOGRAPHY_EMPTY_TITLE}
            description={PERSON_MESSAGES.FILMOGRAPHY_EMPTY_DESCRIPTION}
            headingLevel={3}
          />
        </section>
      );
    }

    return (
      <section className={styles.c_person_filmography}>
        <h2 className={styles.c_person_filmography__heading}>
          {PERSON_MESSAGES.FILMOGRAPHY_HEADING}
          <span className={styles.c_person_filmography__count}>
            {credits.length}件
          </span>
        </h2>

        <MovieGridContainer isLoading={false} isEmpty={false}>
          {movieCacheItems.map((movie, index) => (
            <div key={movie.id} className={styles.c_person_filmography__item}>
              <MovieTile
                movie={movie}
                onClick={handleMovieClick}
                headingLevel={3}
                isInWatchlist={isInWatchlist(movie.id)}
                onWatchlistToggle={toggleWatchlist}
                watchlistDisabled={isMovieToggling(movie.id)}
                onFavoriteToggle={handleFavoriteToggle}
                favoriteDisabled={isFavoriteProcessing(movie.id)}
              />
              {visibleCredits[index].character && (
                <p className={styles.c_person_filmography__character}>
                  {visibleCredits[index].character}
                </p>
              )}
            </div>
          ))}
        </MovieGridContainer>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          className={styles.c_person_filmography__pagination}
        />

        <MovieDetailModal
          movieId={selectedMovieId}
          title={selectedMovieTitle}
          showFinancialInfo={false}
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
      </section>
    );
  },
);

PersonFilmography.displayName = 'PersonFilmography';
