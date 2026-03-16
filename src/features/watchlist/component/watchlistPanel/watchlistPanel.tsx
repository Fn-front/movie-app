/**
 * WatchlistPanelコンポーネント
 * サイドバー内のウォッチリスト表示（公開日が近い順10件 + すべて見るリンク）
 */

'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';

import { Loading } from '@/components/ui/loading/loading';
import { MovieDetailModal } from '@/components/ui/movie/detailModal/movieDetailModal';
import { useWatchlist } from '@/features/watchlist/hooks/useWatchlist';
import { WatchlistItem } from '@/features/watchlist/component/watchlistItem/watchlistItem';
import { ROUTES } from '@/constants';

import styles from './watchlistPanel.module.scss';

/** サイドバーに表示する件数 */
const SIDEBAR_DISPLAY_LIMIT = 10;

/**
 * WatchlistPanelコンポーネント
 */
export const WatchlistPanel = memo(function WatchlistPanel() {
  const { watchlist, isLoading, removeFromWatchlist } = useWatchlist({
    sort: 'release_date_proximity',
    limit: SIDEBAR_DISPLAY_LIMIT,
  });

  const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);

  const handleItemClick = useCallback((tmdbMovieId: number) => {
    setSelectedMovieId(tmdbMovieId);
  }, []);

  const handleModalClose = useCallback(() => {
    setSelectedMovieId(null);
  }, []);

  const selectedMovieTitle = useMemo(
    () =>
      watchlist.find((item) => item.tmdb_movie_id === selectedMovieId)?.title,
    [watchlist, selectedMovieId],
  );

  const handleDelete = useCallback(
    (id: string) => {
      removeFromWatchlist(id);
    },
    [removeFromWatchlist],
  );

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
        <>
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
          </div>

          <Link
            href={ROUTES.WATCHLIST}
            className={styles.c_watchlist_panel__show_all}
          >
            すべて見る
          </Link>
        </>
      )}

      <MovieDetailModal
        movieId={selectedMovieId}
        title={selectedMovieTitle}
        onClose={handleModalClose}
      />
    </div>
  );
});

WatchlistPanel.displayName = 'WatchlistPanel';
