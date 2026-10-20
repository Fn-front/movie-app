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
  /** 日付としてデジタル（配信）公開日を優先表示するか（配信予定タブ用） */
  preferDigitalReleaseDate?: boolean;
}

export const MovieGrid = memo<MovieGridProps>(function MovieGrid({
  movies,
  genres,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  onMovieClick,
  preferDigitalReleaseDate = false,
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
            headingLevel={2}
            onClick={onMovieClick}
            isInWatchlist={isInWatchlist(movie.id)}
            onWatchlistToggle={toggleWatchlist}
            watchlistDisabled={isMovieToggling(movie.id)}
            onFavoriteToggle={handleFavoriteToggle}
            favoriteDisabled={isFavoriteProcessing(movie.id)}
            preferDigitalReleaseDate={preferDigitalReleaseDate}
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
