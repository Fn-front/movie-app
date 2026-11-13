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
import { useMovieDetailQuery } from '@/features/movies/hooks/useMovieDetailQuery';
import { TitleSuggestion } from '@/features/search/component/titleSuggestion/titleSuggestion';
import { useWatchlistToggle } from '@/features/watchlist/hooks/useWatchlistToggle';
import { useFavoriteToggle } from '@/features/favorites/hooks/useFavoriteToggle';
import { FavoriteRatingModal } from '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal';
import { useMovieViewMode } from '@/hooks/useMovieViewMode';
import { DISPLAY_LIMITS, SEARCH_MESSAGES } from '@/constants';
import type { Movie } from '@/lib/types';
import { movieToMovieCacheItem } from '@/utils/toMovieCacheItem';

import styles from './searchResults.module.scss';

/**
 * SearchResultsコンポーネントのプロパティ
 */
export interface SearchResultsProps {
  /**
   * 実行中の検索語
   *
   * 「まだ検索していない」と「検索して0件」を区別するために要る。
   * 件数だけでは区別できない（どちらも movies が空 / #1024）
   */
  query: string;
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
  query,
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

  const { viewMode } = useMovieViewMode();
  const { selectedMovieId, openMovieDetail, closeMovieDetail } =
    useMovieDetailQuery();

  const selectedMovieTitle = useMemo(
    () => movieCacheItems.find((item) => item.id === selectedMovieId)?.title,
    [movieCacheItems, selectedMovieId],
  );

  if (isLoading) {
    return (
      <div className={styles.c_search_results}>
        <MovieGridContainer isLoading isEmpty={false} viewMode={viewMode} />
      </div>
    );
  }

  // まだ検索していない状態。0件と同じ文言を出すと
  // 「別のキーワードで検索してみてください」が意味を成さない（#1024）。
  // 原題の提案も、元になるクエリが無いので出さない
  if (query.trim() === '') {
    return (
      <div className={styles.c_search_results}>
        <EmptyState
          title={SEARCH_MESSAGES.NO_QUERY_TITLE}
          description={SEARCH_MESSAGES.NO_QUERY_DESCRIPTION}
          headingLevel={2}
        />
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
          title={SEARCH_MESSAGES.NO_RESULTS_TITLE}
          description={SEARCH_MESSAGES.NO_RESULTS_DESCRIPTION}
          headingLevel={2}
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

      <MovieGridContainer isLoading={false} isEmpty={false} viewMode={viewMode}>
        {movieCacheItems.map((movie, index) => (
          <MovieTile
            key={movie.id}
            movie={movie}
            onSelect={openMovieDetail}
            headingLevel={2}
            eager={index < DISPLAY_LIMITS.EAGER_TILE_MAX}
            isInWatchlist={isInWatchlist(movie.id)}
            onWatchlistToggle={toggleWatchlist}
            watchlistDisabled={isMovieToggling(movie.id)}
            onFavoriteToggle={handleFavoriteToggle}
            favoriteDisabled={isFavoriteProcessing(movie.id)}
            viewMode={viewMode}
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
        // 開閉は URL の movie_id が持つ。ここでも履歴を積むと2つ伸びる（#1033）
        manageHistory={false}
        movieId={selectedMovieId}
        title={selectedMovieTitle}
        onClose={closeMovieDetail}
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
