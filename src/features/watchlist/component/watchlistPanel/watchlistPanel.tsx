/**
 * WatchlistPanelコンポーネント
 * サイドバー内のウォッチリスト表示（スクロール + 無限読み込み + 映画詳細モーダル）
 */

'use client';

import { memo, useCallback, useState } from 'react';

import { Loading } from '@/components/ui/loading/loading';
import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { useWatchlist } from '@/features/watchlist/hooks/useWatchlist';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { WatchlistItem } from '@/features/watchlist/component/watchlistItem/watchlistItem';

import styles from './watchlistPanel.module.scss';

/**
 * WatchlistPanelコンポーネント
 */
export const WatchlistPanel = memo(function WatchlistPanel() {
  const {
    watchlist,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    removeFromWatchlist,
  } = useWatchlist();

  const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);

  const handleItemClick = useCallback((tmdbMovieId: number) => {
    setSelectedMovieId(tmdbMovieId);
  }, []);

  const handleModalClose = useCallback(() => {
    setSelectedMovieId(null);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      removeFromWatchlist(id);
    },
    [removeFromWatchlist],
  );

  const sentinelRef = useIntersectionObserver(fetchNextPage, {
    enabled: hasNextPage && !isFetchingNextPage,
    rootMargin: '100px',
  });

  if (isLoading) {
    return (
      <div className={styles.c_watchlist_panel__loading}>
        <Loading size='sm' />
      </div>
    );
  }

  return (
    <div className={styles.c_watchlist_panel}>
      {watchlist.length === 0 ? (
        <p className={styles.c_watchlist_panel__empty}>
          ウォッチリストに映画を追加しましょう
        </p>
      ) : (
        <div className={styles.c_watchlist_panel__list} role='list'>
          {watchlist.map((item) => (
            <div key={item.id} role='listitem'>
              <WatchlistItem
                item={item}
                onClick={handleItemClick}
                onDelete={handleDelete}
              />
            </div>
          ))}

          {hasNextPage && (
            <div
              ref={sentinelRef}
              className={styles.c_watchlist_panel__sentinel}
            />
          )}

          {isFetchingNextPage && (
            <div className={styles.c_watchlist_panel__loading}>
              <Loading size='sm' />
            </div>
          )}
        </div>
      )}

      <MovieDetailModal movieId={selectedMovieId} onClose={handleModalClose} />
    </div>
  );
});

WatchlistPanel.displayName = 'WatchlistPanel';
