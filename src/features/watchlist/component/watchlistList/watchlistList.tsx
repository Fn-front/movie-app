/**
 * WatchlistListコンポーネント
 * ウォッチリスト映画のグリッド一覧表示
 */

'use client';

import { memo, useCallback } from 'react';
import Image from 'next/image';

import { Card } from '@/components/ui/card/card';
import { MovieTileSkeleton } from '@/components/ui/movie/movieTileSkeleton/movieTileSkeleton';
import { getTMDbPosterUrl } from '@/utils/image';
import type { WatchlistItem } from '@/lib/api/watchlist/watchlist';

import styles from './watchlistList.module.scss';

/**
 * WatchlistListコンポーネントのプロパティ
 */
export interface WatchlistListProps {
  /** ウォッチリスト一覧 */
  watchlist: WatchlistItem[];
  /** 読み込み中 */
  isLoading: boolean;
  /** タイルクリック時のコールバック */
  onClick?: (tmdbMovieId: number) => void;
  /** 削除コールバック */
  onDelete?: (id: string) => void;
}

/**
 * WatchlistListコンポーネント
 */
export const WatchlistList = memo<WatchlistListProps>(function WatchlistList({
  watchlist,
  isLoading,
  onClick,
  onDelete,
}) {
  if (isLoading) {
    return (
      <div className={styles.c_watchlist_list__grid}>
        <MovieTileSkeleton count={8} />
      </div>
    );
  }

  if (watchlist.length === 0) {
    return (
      <p className={styles.c_watchlist_list__empty}>
        ウォッチリストに映画を追加しましょう
      </p>
    );
  }

  return (
    <div className={styles.c_watchlist_list__grid}>
      {watchlist.map((item) => (
        <WatchlistTile
          key={item.id}
          item={item}
          onClick={onClick}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
});

WatchlistList.displayName = 'WatchlistList';

/**
 * WatchlistTileコンポーネントのプロパティ
 */
interface WatchlistTileProps {
  /** ウォッチリストアイテム */
  item: WatchlistItem;
  /** タイルクリック時のコールバック */
  onClick?: (tmdbMovieId: number) => void;
  /** 削除コールバック */
  onDelete?: (id: string) => void;
}

/**
 * WatchlistTileコンポーネント
 */
const WatchlistTile = memo<WatchlistTileProps>(function WatchlistTile({
  item,
  onClick,
  onDelete,
}) {
  const posterUrl = getTMDbPosterUrl(item.poster_path);

  const handleClick = useCallback(() => {
    onClick?.(item.tmdb_movie_id);
  }, [item.tmdb_movie_id, onClick]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.(item.tmdb_movie_id);
      }
    },
    [item.tmdb_movie_id, onClick],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete?.(item.id);
    },
    [item.id, onDelete],
  );

  const handleDeleteKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onDelete?.(item.id);
      }
    },
    [item.id, onDelete],
  );

  return (
    <Card
      noPadding
      clickable={!!onClick}
      className={styles.c_watchlist_tile}
      onClick={onClick ? handleClick : undefined}
      onKeyDown={onClick ? handleKeyDown : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${item.title}の詳細を表示` : undefined}
    >
      <div className={styles.c_watchlist_tile__poster}>
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={`${item.title}のポスター`}
            width={500}
            height={750}
            className={styles.c_watchlist_tile__image}
          />
        ) : (
          <div className={styles.c_watchlist_tile__no_image}>No Image</div>
        )}
        {onDelete && (
          <div className={styles.c_watchlist_tile__delete_button}>
            <button
              type='button'
              onClick={handleDelete}
              onKeyDown={handleDeleteKeyDown}
              className={styles.c_watchlist_tile__delete}
              aria-label={`${item.title}をウォッチリストから削除`}
            >
              ✕
            </button>
          </div>
        )}
      </div>
      <div className={styles.c_watchlist_tile__info}>
        <h3 className={styles.c_watchlist_tile__title}>{item.title}</h3>
        {item.release_date && (
          <p className={styles.c_watchlist_tile__date}>{item.release_date}</p>
        )}
      </div>
    </Card>
  );
});

WatchlistTile.displayName = 'WatchlistTile';
