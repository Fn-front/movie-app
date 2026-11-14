/**
 * WatchlistPageコンポーネント
 * ウォッチリスト一覧ページのメインコンポーネント
 */

'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button/button';
import { Select } from '@/components/ui/select/select';
import { Loading } from '@/components/ui/loading/loading';
import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { ViewModeToggle } from '@/components/ui/movie/viewModeToggle/viewModeToggle';
import { useMovieDetailQuery } from '@/features/movies/hooks/useMovieDetailQuery';
import { WATCHLIST_CLEANUP_LABELS } from '@/constants';
import { StreamingSortHint } from '@/features/watchlist/component/streamingSortHint/streamingSortHint';
import { WatchlistCleanupModal } from '@/features/watchlist/component/watchlistCleanupModal/watchlistCleanupModal';
import { WatchlistList } from '@/features/watchlist/component/watchlistList/watchlistList';
import { FavoriteRatingModal } from '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal';
import { useFavoriteToggle } from '@/features/favorites/hooks/useFavoriteToggle';
import type { WatchlistItem } from '@/lib/api/watchlist/watchlist';
import {
  useWatchlistPage,
  WATCHLIST_PAGE_SORT_OPTIONS,
} from '@/features/watchlist/hooks/useWatchlistPage';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';

import styles from './watchlistPage.module.scss';

/** ソートオプション（ファイルスコープ定数） */
const SORT_OPTIONS = WATCHLIST_PAGE_SORT_OPTIONS.map((option) => ({
  label: option.label,
  value: option.value,
}));

/**
 * WatchlistPageコンポーネント
 */
export const WatchlistPage = memo(function WatchlistPage() {
  const {
    watchlist,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    removeFromWatchlist,
    setWatched,
    isUpdatingWatched,
    sortBy,
    handleSortChange,
  } = useWatchlistPage();

  const {
    modalState: favoriteModalState,
    handleFavoriteToggle,
    closeModal: closeFavoriteModal,
    handleModalSubmit: handleFavoriteModalSubmit,
    handleDelete: handleFavoriteDelete,
    getFavoriteInfo,
  } = useFavoriteToggle();

  const { selectedMovieId, openMovieDetail, closeMovieDetail } =
    useMovieDetailQuery();
  const [isCleanupOpen, setIsCleanupOpen] = useState(false);

  const handleCleanupOpen = useCallback(() => {
    setIsCleanupOpen(true);
  }, []);

  /**
   * 視聴済みの付け外し。
   *
   * 視聴済みにしたときだけ評価モーダルを開く。登録せずに閉じても視聴済みは残る
   * （お気に入り登録は任意）ので、ここでは視聴済みの更新を先に確定させる。
   */
  const handleWatchedToggle = useCallback(
    (item: WatchlistItem, watched: boolean) => {
      setWatched(item.id, watched);

      if (!watched) return;

      handleFavoriteToggle(
        {
          id: item.tmdb_movie_id,
          title: item.title,
          poster_path: item.poster_path,
          release_date: item.release_date,
        },
        getFavoriteInfo(item.tmdb_movie_id),
      );
    },
    [setWatched, handleFavoriteToggle, getFavoriteInfo],
  );

  const selectedMovieTitle = useMemo(
    () =>
      watchlist.find((item) => item.tmdb_movie_id === selectedMovieId)?.title,
    [watchlist, selectedMovieId],
  );

  const sentinelRef = useIntersectionObserver(fetchNextPage, {
    enabled: hasNextPage && !isFetchingNextPage,
    rootMargin: '100px',
  });

  return (
    <div className={styles.c_watchlist_page}>
      <div className={styles.c_watchlist_page__toolbar}>
        <div className={styles.c_watchlist_page__title_group}>
          <h1 className={styles.c_watchlist_page__title}>ウォッチリスト</h1>
          <StreamingSortHint />
        </div>
        <div className={styles.c_watchlist_page__controls}>
          <ViewModeToggle />
          <Select
            options={SORT_OPTIONS}
            value={sortBy}
            onValueChange={handleSortChange}
            aria-label='ソート順を選択'
            className={styles.c_watchlist_page__sort}
          />
          {/* 一覧ページのツールバーに置く補助操作は ghost で揃える
              （映画一覧の movieListToolbar と同じ扱い） */}
          <Button variant='ghost' size='sm' onClick={handleCleanupOpen}>
            {WATCHLIST_CLEANUP_LABELS.OPEN_BUTTON}
          </Button>
        </div>
      </div>

      <WatchlistList
        watchlist={watchlist}
        isLoading={isLoading}
        onClick={openMovieDetail}
        onDelete={removeFromWatchlist}
        onWatchedToggle={handleWatchedToggle}
        isWatchedUpdating={isUpdatingWatched}
        getFavoriteInfo={getFavoriteInfo}
      />

      {hasNextPage && (
        <div ref={sentinelRef} className={styles.c_watchlist_page__sentinel} />
      )}

      {isFetchingNextPage && (
        <div className={styles.c_watchlist_page__loading}>
          <Loading size='sm' />
        </div>
      )}

      <MovieDetailModal
        // 開閉は URL の movie_id が持つ。ここでも履歴を積むと2つ伸びる（#1033）
        manageHistory={false}
        movieId={selectedMovieId}
        title={selectedMovieTitle}
        showFinancialInfo={false}
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

      <WatchlistCleanupModal
        open={isCleanupOpen}
        onOpenChange={setIsCleanupOpen}
      />
    </div>
  );
});

WatchlistPage.displayName = 'WatchlistPage';
