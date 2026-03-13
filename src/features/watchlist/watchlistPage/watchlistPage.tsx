/**
 * WatchlistPageコンポーネント
 * ウォッチリスト一覧ページのメインコンポーネント
 */

'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import { Select } from '@/components/ui/select/select';
import { Loading } from '@/components/ui/loading/loading';
import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { WatchlistList } from '@/features/watchlist/component/watchlistList/watchlistList';
import {
  useWatchlistPage,
  WATCHLIST_PAGE_SORT_OPTIONS,
} from '@/features/watchlist/hooks/useWatchlistPage';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';

import styles from './watchlistPage.module.scss';

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
    sortBy,
    handleSortChange,
  } = useWatchlistPage();

  const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);

  const handleMovieClick = useCallback((tmdbMovieId: number) => {
    setSelectedMovieId(tmdbMovieId);
  }, []);

  const handleDetailModalClose = useCallback(() => {
    setSelectedMovieId(null);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      removeFromWatchlist(id);
    },
    [removeFromWatchlist],
  );

  const sortOptions = useMemo(
    () =>
      WATCHLIST_PAGE_SORT_OPTIONS.map((option) => ({
        label: option.label,
        value: option.value,
      })),
    [],
  );

  const sentinelRef = useIntersectionObserver(fetchNextPage, {
    enabled: hasNextPage && !isFetchingNextPage,
    rootMargin: '100px',
  });

  return (
    <div className={styles.c_watchlist_page}>
      <div className={styles.c_watchlist_page__toolbar}>
        <h2 className={styles.c_watchlist_page__title}>ウォッチリスト</h2>
        <div className={styles.c_watchlist_page__controls}>
          <Select
            options={sortOptions}
            value={sortBy}
            onValueChange={handleSortChange}
            aria-label='ソート順を選択'
            className={styles.c_watchlist_page__sort}
          />
        </div>
      </div>

      <WatchlistList
        watchlist={watchlist}
        isLoading={isLoading}
        onClick={handleMovieClick}
        onDelete={handleDelete}
      />

      {hasNextPage && (
        <div
          ref={sentinelRef}
          className={styles.c_watchlist_page__sentinel}
        />
      )}

      {isFetchingNextPage && (
        <div className={styles.c_watchlist_page__loading}>
          <Loading size='sm' />
        </div>
      )}

      <MovieDetailModal
        movieId={selectedMovieId}
        showFinancialInfo={false}
        onClose={handleDetailModalClose}
      />
    </div>
  );
});

WatchlistPage.displayName = 'WatchlistPage';
