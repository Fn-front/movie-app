/**
 * FavoritesPageコンポーネント
 * お気に入り一覧ページのメインコンポーネント
 */

'use client';

import { memo, useCallback, useMemo } from 'react';

import { Select } from '@/components/ui/select/select';
import { Loading } from '@/components/ui/loading/loading';
import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { FavoriteList } from '@/features/favorites/component/favoriteList/favoriteList';
import { FavoriteRatingModal } from '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { usePrependScrollAnchor } from '@/hooks/usePrependScrollAnchor';
import { useMovieDetailQuery } from '@/features/movies/hooks/useMovieDetailQuery';
import {
  useFavoritesPage,
  FAVORITES_PAGE_SORT_OPTIONS,
} from '@/features/favorites/hooks/useFavoritesPage';

import styles from './favoritesPage.module.scss';

/**
 * FavoritesPageコンポーネント
 */
export const FavoritesPage = memo(function FavoritesPage() {
  const {
    favorites,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isFetchingPreviousPage,
    hasPreviousPage,
    fetchPreviousPage,
    sortBy,
    handleSortChange,
    favoriteToggle,
  } = useFavoritesPage();

  const {
    modalState,
    handleFavoriteToggle,
    closeModal,
    handleModalSubmit,
    handleDelete,
    isFavoriteProcessing,
  } = favoriteToggle;

  const { selectedMovieId, openMovieDetail, closeMovieDetail } =
    useMovieDetailQuery();

  const selectedMovieTitle = useMemo(
    () => favorites.find((f) => f.tmdb_movie_id === selectedMovieId)?.title,
    [favorites, selectedMovieId],
  );

  const sortOptions = useMemo(
    () =>
      FAVORITES_PAGE_SORT_OPTIONS.map((option) => ({
        label: option.label,
        value: option.value,
      })),
    [],
  );

  const loadMoreRef = useIntersectionObserver(fetchNextPage, {
    enabled: hasNextPage && !isFetchingNextPage,
  });

  // 上方向のロード（#972）。
  //
  // `maxPages` を付けたため、先に進むと先頭ページがキャッシュから捨てられる。
  // この導線が無いと、戻ったときに表示中だった項目がそのまま消える
  // 依存は**先頭の識別子**。件数だと `maxPages` で増減が相殺され発火しない
  const { listRef, captureBeforePrepend } =
    usePrependScrollAnchor<HTMLDivElement>(favorites[0]?.id);

  // 取得の直前に寸法を控える。先頭に項目が差し込まれるぶんだけ
  // 下の内容が押し下げられるため、補正しないと見ていた場所が飛ぶ
  const handleFetchPrevious = useCallback(() => {
    captureBeforePrepend();
    fetchPreviousPage();
  }, [captureBeforePrepend, fetchPreviousPage]);

  const loadPreviousRef = useIntersectionObserver(handleFetchPrevious, {
    enabled: hasPreviousPage && !isFetchingPreviousPage,
  });

  return (
    <div className={styles.c_favorites_page}>
      <div className={styles.c_favorites_page__toolbar}>
        <h1 className={styles.c_favorites_page__title}>お気に入り</h1>
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

      <div ref={loadPreviousRef} />

      {isFetchingPreviousPage && (
        <div className={styles.c_favorites_page__loading}>
          <Loading size='sm' label='読み込み中...' />
        </div>
      )}

      <FavoriteList
        gridRef={listRef}
        favorites={favorites}
        isLoading={isLoading}
        onFavoriteToggle={handleFavoriteToggle}
        isFavoriteProcessing={isFavoriteProcessing}
        onClick={openMovieDetail}
      />

      {isFetchingNextPage && (
        <div className={styles.c_favorites_page__loading}>
          <Loading size='sm' label='読み込み中...' />
        </div>
      )}

      <div ref={loadMoreRef} />

      <MovieDetailModal
        // 開閉は URL の movie_id が持つ。ここでも履歴を積むと2つ伸びる（#1033）
        manageHistory={false}
        movieId={selectedMovieId}
        title={selectedMovieTitle}
        showFinancialInfo={false}
        onClose={closeMovieDetail}
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
