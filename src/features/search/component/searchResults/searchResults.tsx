/**
 * SearchResultsコンポーネント
 * 検索結果一覧表示
 */

'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import { MovieTile } from '@/components/ui/movie/movieTile/movieTile';
import { MovieTileSkeleton } from '@/components/ui/movie/movieTileSkeleton/movieTileSkeleton';
import { Pagination } from '@/components/ui/pagination/pagination';
import { EmptyState } from '@/components/ui/emptyState/emptyState';
import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { useWatchlistToggle } from '@/features/watchlist/hooks/useWatchlistToggle';
import { useFavoriteToggle } from '@/features/favorites/hooks/useFavoriteToggle';
import { FavoriteRatingModal } from '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal';
import type { Movie } from '@/lib/types';
import type { MovieCacheItem } from '@/lib/api/movies/movies';
import type { MovieFavoriteInfo } from '@/lib/api/favorites/favorites';

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
}

/**
 * Movie型をMovieCacheItem型に変換
 *
 * release_type / is_revival は検索APIのレスポンスに含まれないため、
 * MovieTileの表示用にデフォルト値を設定している。
 * 検索結果ではこれらの情報は表示に影響しない。
 */
function toMovieCacheItem(
  movie: Movie,
  favorite: MovieFavoriteInfo | null,
): MovieCacheItem {
  return {
    id: movie.id,
    title: movie.title,
    poster_path: movie.poster_path,
    backdrop_path: movie.backdrop_path,
    release_date: movie.release_date,
    overview: movie.overview,
    vote_average: movie.vote_average,
    popularity: movie.popularity,
    genre_ids: movie.genre_ids,
    release_type: 'theatrical',
    is_revival: false,
    favorite,
  };
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

  const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);

  const handleMovieClick = useCallback((movieId: number) => {
    setSelectedMovieId(movieId);
  }, []);

  const handleDetailModalClose = useCallback(() => {
    setSelectedMovieId(null);
  }, []);

  const movieCacheItems = useMemo(
    () =>
      movies.map((movie) => toMovieCacheItem(movie, getFavoriteInfo(movie.id))),
    [movies, getFavoriteInfo],
  );

  if (isLoading) {
    return (
      <div className={styles.c_search_results}>
        <div className={styles.c_search_results__grid}>
          <MovieTileSkeleton />
        </div>
      </div>
    );
  }

  if (movies.length === 0) {
    return (
      <div className={styles.c_search_results}>
        <EmptyState
          title='検索結果が見つかりませんでした'
          description='別のキーワードで検索してみてください'
        />
      </div>
    );
  }

  return (
    <div className={styles.c_search_results}>
      <p className={styles.c_search_results__count}>
        {totalResults.toLocaleString()}件の検索結果
      </p>

      <div className={styles.c_search_results__grid}>
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
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={onPageChange}
        className={styles.c_search_results__pagination}
      />

      <MovieDetailModal
        movieId={selectedMovieId}
        title={movies.find((movie) => movie.id === selectedMovieId)?.title}
        showFinancialInfo={false}
        onClose={handleDetailModalClose}
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
