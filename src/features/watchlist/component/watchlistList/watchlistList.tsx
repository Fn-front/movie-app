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
import { RatingIndicator } from '@/features/favorites/component/ratingIndicator/ratingIndicator';
import { StreamingBadge } from '@/features/watchlist/component/streamingBadge/streamingBadge';
import {
  IMAGE_SIZES,
  DISPLAY_LIMITS,
  EMPTY_MESSAGES,
  FAVORITES_RATING_MAX,
  WATCHLIST_WATCHED_LABELS,
} from '@/constants';
import { getTMDbPosterUrl } from '@/utils/image';
import type { MovieFavoriteInfo } from '@/lib/api/favorites/favorites';
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
  /**
   * 指定映画のお気に入り情報を取得（未登録ならnull）
   *
   * 視聴済みの作品に付けた評価をカードに出すために使う。
   * 渡さなければ評価は表示しない（サイドバーなど評価を出さない場所向け）
   */
  getFavoriteInfo?: (tmdbMovieId: number) => MovieFavoriteInfo | null;
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
  getFavoriteInfo,
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
          favorite={getFavoriteInfo?.(item.tmdb_movie_id) ?? null}
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
  /** この作品のお気に入り情報（未登録なら null） */
  favorite?: MovieFavoriteInfo | null;
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
  favorite = null,
}) {
  const posterUrl = getTMDbPosterUrl(item.poster_path);
  const isWatched = item.watched_at !== null;
  // 「観た作品に何点を付けたか」を見せるための表示なので、視聴済みのときだけ出す。
  // 視聴済みを解除すれば、お気に入り登録が残っていても消える
  const showsRating = isWatched && favorite !== null;

  // 評価はカード本体（role='button'）の内側にある。ARIA の
  // Children Presentational により、role='button' の子孫はアクセシビリティ
  // ツリーから刈られる実装があるため、RatingIndicator の aria-label だけでは
  // 読み上げに届かない。カードの名前そのものに畳み込む
  const cardLabel = showsRating
    ? `${item.title}（評価 ${favorite.rating}/${FAVORITES_RATING_MAX}）`
    : item.title;

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
      aria-label={onClick ? cardLabel : undefined}
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
        {/* 視聴済みには出さない。優先表示の対象は未視聴だけで、
            視聴済みバッジと同じ位置に置いているため重なりも避けられる */}
        {!isWatched && item.streaming && (
          <div className={styles.c_watchlist_tile__streaming}>
            <StreamingBadge streaming={item.streaming} />
          </div>
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
        <div className={styles.c_watchlist_tile__meta}>
          {item.release_date && (
            <p className={styles.c_watchlist_tile__date}>{item.release_date}</p>
          )}
          {showsRating && (
            <RatingIndicator rating={favorite.rating} size='sm' />
          )}
        </div>
      </div>
    </Card>
  );
});

WatchlistTile.displayName = 'WatchlistTile';
