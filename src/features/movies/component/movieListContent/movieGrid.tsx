/**
 * MovieGridコンポーネント
 * 映画タイルのグリッド表示（ウォッチリスト・お気に入りアクション含む）
 */

'use client';

import { memo } from 'react';

import { MovieTile } from '@/components/ui/movie/movieTile/movieTile';
import { MovieTileSkeleton } from '@/components/ui/movie/movieTileSkeleton/movieTileSkeleton';
import { Loading } from '@/components/ui/loading/loading';
import { useWatchlistToggle } from '@/features/watchlist/hooks/useWatchlistToggle';
import { useFavoriteToggle } from '@/features/favorites/hooks/useFavoriteToggle';
import { FavoriteRatingModal } from '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import type { MovieCacheItem } from '@/lib/api/movies/movies';

import styles from './movieListContent.module.scss';

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

  const loadMoreRef = useIntersectionObserver(fetchNextPage, {
    enabled: hasNextPage && !isFetchingNextPage,
  });

  return (
    <>
      <div className={styles.c_movie_list__grid}>
        {isLoading ? (
          <MovieTileSkeleton />
        ) : (
          movies.map((movie) => (
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
          ))
        )}
      </div>

      {!isLoading && movies.length === 0 && (
        <p className={styles.c_movie_list__empty}>表示する映画がありません。</p>
      )}

      {isFetchingNextPage && (
        <div className={styles.c_movie_list__loading}>
          <Loading size='sm' label='読み込み中...' />
        </div>
      )}

      <div ref={loadMoreRef} className={styles.c_movie_list__sentinel} />

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
