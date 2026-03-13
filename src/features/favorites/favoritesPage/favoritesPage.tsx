/**
 * FavoritesPageコンポーネント
 * お気に入り一覧ページのメインコンポーネント
 */

'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import { Select } from '@/components/ui/select/select';
import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { FavoriteList } from '@/features/favorites/component/favoriteList/favoriteList';
import { FavoriteRatingModal } from '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal';
import {
  useFavoritesPage,
  FAVORITES_PAGE_SORT_OPTIONS,
} from '@/features/favorites/hooks/useFavoritesPage';

import styles from './favoritesPage.module.scss';

/**
 * FavoritesPageコンポーネント
 */
export const FavoritesPage = memo(function FavoritesPage() {
  const { favorites, isLoading, sortBy, handleSortChange, favoriteToggle } =
    useFavoritesPage();

  const {
    modalState,
    handleFavoriteToggle,
    closeModal,
    handleModalSubmit,
    handleDelete,
    isFavoriteProcessing,
  } = favoriteToggle;

  const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);

  const handleMovieClick = useCallback((tmdbMovieId: number) => {
    setSelectedMovieId(tmdbMovieId);
  }, []);

  const handleDetailModalClose = useCallback(() => {
    setSelectedMovieId(null);
  }, []);

  const sortOptions = useMemo(
    () =>
      FAVORITES_PAGE_SORT_OPTIONS.map((option) => ({
        label: option.label,
        value: option.value,
      })),
    [],
  );

  return (
    <div className={styles.c_favorites_page}>
      <div className={styles.c_favorites_page__toolbar}>
        <h2 className={styles.c_favorites_page__title}>お気に入り</h2>
        <div className={styles.c_favorites_page__controls}>
          <Select
            options={sortOptions}
            value={sortBy}
            onValueChange={handleSortChange}
            aria-label='ソート順を選択'
            className={styles.c_favorites_page__sort}
          />
        </div>
      </div>

      <FavoriteList
        favorites={favorites}
        isLoading={isLoading}
        onFavoriteToggle={handleFavoriteToggle}
        isFavoriteProcessing={isFavoriteProcessing}
        onClick={handleMovieClick}
      />

      <MovieDetailModal
        movieId={selectedMovieId}
        showFinancialInfo={false}
        onClose={handleDetailModalClose}
      />

      <FavoriteRatingModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        movieTitle={modalState.movie?.title ?? ''}
        currentFavorite={modalState.currentFavorite}
        onSubmit={handleModalSubmit}
        onDelete={handleDelete}
      />
    </div>
  );
});

FavoritesPage.displayName = 'FavoritesPage';
