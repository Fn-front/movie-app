/**
 * WatchlistListコンポーネント
 * ウォッチリスト映画のグリッド一覧表示
 */

'use client';

import { memo, useCallback } from 'react';
import Image from 'next/image';
import { IoCheckmarkCircle, IoCheckmarkCircleOutline } from 'react-icons/io5';

import { Card } from '@/components/ui/card/card';
import { MovieTileSkeleton } from '@/components/ui/movie/movieTileSkeleton/movieTileSkeleton';
import {
  IMAGE_SIZES,
  DISPLAY_LIMITS,
  EMPTY_MESSAGES,
  WATCHLIST_WATCHED_LABELS,
} from '@/constants';
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
  /** 視聴済みの付け外しコールバック */
  onWatchedToggle?: (item: WatchlistItem, watched: boolean) => void;
  /** 視聴済みの更新中 */
  isWatchedUpdating?: boolean;
}

/**
 * WatchlistListコンポーネント
 *
 * 視聴済みを最下部へ送る並びはサーバー側（get_watchlist_sorted）の責務。
 * ここでは受け取った順にそのまま描画する。
 */
export const WatchlistList = memo<WatchlistListProps>(function WatchlistList({
  watchlist,
  isLoading,
  onClick,
  onDelete,
  onWatchedToggle,
  isWatchedUpdating = false,
}) {
  if (isLoading) {
    return (
      <div className={styles.c_watchlist_list__grid}>
        <MovieTileSkeleton count={DISPLAY_LIMITS.SKELETON_SMALL} />
      </div>
    );
  }

  if (watchlist.length === 0) {
    return (
      <p className={styles.c_watchlist_list__empty}>
        {EMPTY_MESSAGES.WATCHLIST}
      </p>
    );
  }

  return (
    <div className={styles.c_watchlist_list__grid}>
      {watchlist.map((item, index) => (
        <WatchlistTile
          key={item.id}
          item={item}
          onClick={onClick}
          onDelete={onDelete}
          onWatchedToggle={onWatchedToggle}
          isWatchedUpdating={isWatchedUpdating}
          eager={index < DISPLAY_LIMITS.EAGER_TILE_MAX}
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
  /** 視聴済みの付け外しコールバック */
  onWatchedToggle?: (item: WatchlistItem, watched: boolean) => void;
  /** 視聴済みの更新中 */
  isWatchedUpdating?: boolean;
  /**
   * ポスターを遅延せず即時読み込みするか（既定: false）
   *
   * フォールド上のタイルは LCP 要素になりうる。先頭数件にだけ渡すこと
   * （MovieTile の同名 prop と同じ考え方）
   */
  eager?: boolean;
}

/**
 * WatchlistTileコンポーネント
 */
const WatchlistTile = memo<WatchlistTileProps>(function WatchlistTile({
  item,
  onClick,
  onDelete,
  onWatchedToggle,
  isWatchedUpdating = false,
  eager = false,
}) {
  const posterUrl = getTMDbPosterUrl(item.poster_path);
  const isWatched = item.watched_at !== null;

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

  const handleWatchedToggle = useCallback(
    (e: React.MouseEvent) => {
      // タイル本体のクリック（詳細モーダル）に伝播させない
      e.stopPropagation();
      onWatchedToggle?.(item, !isWatched);
    },
    [item, isWatched, onWatchedToggle],
  );

  const handleWatchedKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onWatchedToggle?.(item, !isWatched);
      }
    },
    [item, isWatched, onWatchedToggle],
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
      aria-label={onClick ? item.title : undefined}
    >
      <div className={styles.c_watchlist_tile__poster}>
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={`${item.title}のポスター`}
            width={IMAGE_SIZES.POSTER.WIDTH}
            height={IMAGE_SIZES.POSTER.HEIGHT}
            loading={eager ? 'eager' : 'lazy'}
            className={styles.c_watchlist_tile__image}
          />
        ) : (
          <div className={styles.c_watchlist_tile__no_image}>No Image</div>
        )}
        {isWatched && (
          <span
            className={styles.c_watchlist_tile__watched_badge}
            aria-hidden='true'
          >
            {WATCHLIST_WATCHED_LABELS.BADGE}
          </span>
        )}
        {onWatchedToggle && (
          <div className={styles.c_watchlist_tile__watched_button}>
            <button
              type='button'
              onClick={handleWatchedToggle}
              onKeyDown={handleWatchedKeyDown}
              disabled={isWatchedUpdating}
              className={styles.c_watchlist_tile__watched}
              aria-label={`${item.title}を${
                isWatched
                  ? WATCHLIST_WATCHED_LABELS.UNMARK
                  : WATCHLIST_WATCHED_LABELS.MARK
              }`}
              aria-pressed={isWatched}
            >
              {isWatched ? (
                <IoCheckmarkCircle aria-hidden='true' />
              ) : (
                <IoCheckmarkCircleOutline aria-hidden='true' />
              )}
            </button>
          </div>
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
        <h2 className={styles.c_watchlist_tile__title}>{item.title}</h2>
        {item.release_date && (
          <p className={styles.c_watchlist_tile__date}>{item.release_date}</p>
        )}
      </div>
    </Card>
  );
});

WatchlistTile.displayName = 'WatchlistTile';
