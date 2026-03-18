/**
 * SearchResultsコンポーネント
 * 検索結果一覧表示
 */

'use client';

import { memo, useMemo } from 'react';

import { MovieTile } from '@/components/ui/movie/movieTile/movieTile';
import { MovieGridContainer } from '@/components/ui/movie/movieGridContainer/movieGridContainer';
import { Pagination } from '@/components/ui/pagination/pagination';
import { EmptyState } from '@/components/ui/emptyState/emptyState';
import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { TitleSuggestion } from '@/features/search/component/titleSuggestion/titleSuggestion';
import { useWatchlistToggle } from '@/features/watchlist/hooks/useWatchlistToggle';
import { useFavoriteToggle } from '@/features/favorites/hooks/useFavoriteToggle';
import { FavoriteRatingModal } from '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal';
import { useMovieDetailModal } from '@/hooks/useMovieDetailModal';
import type { Movie } from '@/lib/types';
import { movieToMovieCacheItem } from '@/utils/toMovieCacheItem';

import styles from './searchResults.module.scss';

/**
 * SearchResultsコンポーネントのプロパティ
 */
export interface SearchResultsProps {
  /** 検索結果の映画一覧 */
  movies: Movie[];
  /** 総件数 */
  totalResults: number;
  /** 現在のページ */
  currentPage: number;
  /** 総ページ数 */
  totalPages: number;
  /** ページ変更ハンドラー */
  onPageChange: (page: number) => void;
  /** ローディング中 */
  isLoading: boolean;
  /** 原題提案候補 */
  suggestions?: string[];
  /** 原題提案ローディング中 */
  isSuggestionLoading?: boolean;
}

/**
 * SearchResultsコンポーネント
 */
export const SearchResults = memo<SearchResultsProps>(function SearchResults({
  movies,
  totalResults,
  currentPage,
  totalPages,
  onPageChange,
  isLoading,
  suggestions,
  isSuggestionLoading,
}) {
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

  const movieCacheItems = useMemo(
    () =>
      movies.map((movie) =>
        movieToMovieCacheItem(movie, getFavoriteInfo(movie.id)),
      ),
    [movies, getFavoriteInfo],
  );

  const {
    selectedMovieId,
    selectedMovieTitle,
    handleMovieClick,
    handleModalClose,
  } = useMovieDetailModal(movieCacheItems);

  if (isLoading) {
    return (
      <div className={styles.c_search_results}>
        <MovieGridContainer isLoading isEmpty={false}>
          {null}
        </MovieGridContainer>
      </div>
    );
  }

  if (movies.length === 0) {
    return (
      <div className={styles.c_search_results}>
        <TitleSuggestion
          suggestions={suggestions ?? []}
          isLoading={isSuggestionLoading ?? false}
        />
        <EmptyState
          title='検索結果が見つかりませんでした'
          description='別のキーワードで検索してみてください'
        />
      </div>
    );
  }

  return (
    <div className={styles.c_search_results}>
      <TitleSuggestion
        suggestions={suggestions ?? []}
        isLoading={isSuggestionLoading ?? false}
      />
      <p className={styles.c_search_results__count}>
        {totalResults.toLocaleString()}件の検索結果
      </p>

      <MovieGridContainer isLoading={false} isEmpty={false}>
        {movieCacheItems.map((movie) => (
          <MovieTile
            key={movie.id}
            movie={movie}
            onClick={handleMovieClick}
            isInWatchlist={isInWatchlist(movie.id)}
            onWatchlistToggle={toggleWatchlist}
            watchlistDisabled={isMovieToggling(movie.id)}
            onFavoriteToggle={handleFavoriteToggle}
            favoriteDisabled={isFavoriteProcessing(movie.id)}
          />
        ))}
      </MovieGridContainer>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
        className={styles.c_search_results__pagination}
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
    </div>
  );
});

SearchResults.displayName = 'SearchResults';
