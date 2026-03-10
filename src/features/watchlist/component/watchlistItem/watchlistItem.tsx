/**
 * WatchlistItemコンポーネント
 * ウォッチリストの個別アイテム表示（小ポスター + タイトル + 削除ボタン）
 */

'use client';

import { memo, useCallback } from 'react';
import Image from 'next/image';

import { getTMDbImageUrl } from '@/utils/image';
import type { WatchlistItem as WatchlistItemType } from '@/lib/api/watchlist/watchlist';

import styles from './watchlistItem.module.scss';

/**
 * WatchlistItemコンポーネントのプロパティ
 */
export interface WatchlistItemProps {
  /** ウォッチリストアイテムデータ */
  item: WatchlistItemType;
  /** アイテムクリック時のコールバック（映画詳細モーダル表示用） */
  onClick: (tmdbMovieId: number) => void;
  /** 削除ボタンクリック時のコールバック */
  onDelete: (id: string) => void;
}

/**
 * WatchlistItemコンポーネント
 */
export const WatchlistItem = memo<WatchlistItemProps>(function WatchlistItem({
  item,
  onClick,
  onDelete,
}) {
  const handleClick = useCallback(() => {
    onClick(item.tmdb_movie_id);
  }, [onClick, item.tmdb_movie_id]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick(item.tmdb_movie_id);
      }
    },
    [onClick, item.tmdb_movie_id],
  );

  const handleDelete = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onDelete(item.id);
    },
    [onDelete, item.id],
  );

  const handleDeleteKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        onDelete(item.id);
      }
    },
    [onDelete, item.id],
  );

  const posterUrl = getTMDbImageUrl(item.poster_path, 'w92');

  return (
    <div
      className={styles.c_watchlist_item}
      role='button'
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`${item.title}の詳細を表示`}
    >
      {posterUrl ? (
        <Image
          className={styles.c_watchlist_item__poster}
          src={posterUrl}
          alt={`${item.title}のポスター`}
          width={36}
          height={54}
        />
      ) : (
        <div
          className={styles.c_watchlist_item__poster_fallback}
          aria-hidden='true'
        >
          🎬
        </div>
      )}

      <div className={styles.c_watchlist_item__info}>
        <p className={styles.c_watchlist_item__title} title={item.title}>
          {item.title}
        </p>
      </div>

      <button
        className={styles.c_watchlist_item__delete}
        onClick={handleDelete}
        onKeyDown={handleDeleteKeyDown}
        aria-label={`${item.title}をウォッチリストから削除`}
        type='button'
      >
        ✕
      </button>
    </div>
  );
});

WatchlistItem.displayName = 'WatchlistItem';
