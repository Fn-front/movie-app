/**
 * MovieGridコンポーネント
 * 映画タイルのグリッド表示（ウォッチリスト・お気に入りアクション含む）
 */

'use client';

import { memo } from 'react';

import { MovieTile } from '@/components/ui/movie/movieTile/movieTile';
import { MovieGridContainer } from '@/components/ui/movie/movieGridContainer/movieGridContainer';
import { useWatchlistToggle } from '@/features/watchlist/hooks/useWatchlistToggle';
import { useFavoriteToggle } from '@/features/favorites/hooks/useFavoriteToggle';
import { FavoriteRatingModal } from '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal';
import type { MovieCacheItem } from '@/lib/api/movies/movies';

export interface MovieGridProps {
  movies: MovieCacheItem[];
  genres: Record<number, string>;
  isLoading: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  onMovieClick: (movieId: number) => void;
}

export const MovieGrid = memo<MovieGridProps>(function MovieGrid({
  movies,
  genres,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  onMovieClick,
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
  } = useFavoriteToggle();

  return (
    <>
      <MovieGridContainer
        isLoading={isLoading}
        isEmpty={movies.length === 0}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
      >
        {movies.map((movie) => (
          <MovieTile
            key={movie.id}
            movie={movie}
            genres={genres}
            onClick={onMovieClick}
            isInWatchlist={isInWatchlist(movie.id)}
            onWatchlistToggle={toggleWatchlist}
            watchlistDisabled={isMovieToggling(movie.id)}
            onFavoriteToggle={handleFavoriteToggle}
            favoriteDisabled={isFavoriteProcessing(movie.id)}
          />
        ))}
      </MovieGridContainer>

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

MovieGrid.displayName = 'MovieGrid';
