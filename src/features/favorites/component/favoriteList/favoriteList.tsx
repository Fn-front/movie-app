/**
 * FavoriteListコンポーネント
 * お気に入り映画のグリッド一覧表示
 */

'use client';

import { memo, useCallback, type Ref } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { Card } from '@/components/ui/card/card';
import { RatingIndicator } from '@/features/favorites/component/ratingIndicator/ratingIndicator';
import { FavoriteButton } from '@/features/favorites/component/favoriteButton/favoriteButton';
import { MovieGridContainer } from '@/components/ui/movie/movieGridContainer/movieGridContainer';
import {
  IMAGE_SIZES,
  DISPLAY_LIMITS,
  EMPTY_MESSAGES,
  ROUTES,
} from '@/constants';
import { getTMDbPosterUrl } from '@/utils/image';
import { shouldLetBrowserHandle } from '@/utils/linkClick';
import { cn } from '@/utils/cn';
import {
  DEFAULT_MOVIE_VIEW_MODE,
  useMovieViewMode,
  type MovieViewMode,
} from '@/hooks/useMovieViewMode';
import type {
  FavoriteItem,
  MovieFavoriteInfo,
} from '@/lib/api/favorites/favorites';

import styles from './favoriteList.module.scss';

/**
 * FavoriteListコンポーネントのプロパティ
 */
export interface FavoriteListProps {
  /** お気に入り一覧 */
  favorites: FavoriteItem[];
  /** グリッド要素への ref（スクロール位置の補正に使う / #972） */
  gridRef?: Ref<HTMLDivElement>;
  /** 読み込み中 */
  isLoading: boolean;
  /** お気に入りボタンクリック時のコールバック */
  onFavoriteToggle: (
    movie: {
      id: number;
      title: string;
      poster_path: string | null;
      release_date: string | null;
    },
    favorite: MovieFavoriteInfo | null,
  ) => void;
  /** 指定映画が処理中かどうか（per-movie無効化用） */
  isFavoriteProcessing?: (tmdbMovieId: number) => boolean;
  /** タイルクリック時のコールバック */
  onClick?: (tmdbMovieId: number) => void;
}

/**
 * FavoriteListコンポーネント
 */
export const FavoriteList = memo<FavoriteListProps>(function FavoriteList({
  favorites,
  isLoading,
  onFavoriteToggle,
  isFavoriteProcessing,
  onClick,
  gridRef,
}) {
  // コンテナとタイルの両方へ同じ値を渡す。片方だけだと、1カラムに
  // なっても縦長カードが並ぶだけで一覧性が上がらない（#1050）
  const { viewMode } = useMovieViewMode();

  return (
    <MovieGridContainer
      gridRef={gridRef}
      isLoading={isLoading}
      isEmpty={favorites.length === 0}
      emptyMessage={EMPTY_MESSAGES.FAVORITES}
      skeletonCount={DISPLAY_LIMITS.SKELETON_SMALL}
      viewMode={viewMode}
    >
      {favorites.map((item, index) => (
        <FavoriteTile
          key={item.id}
          item={item}
          onFavoriteToggle={onFavoriteToggle}
          favoriteDisabled={isFavoriteProcessing?.(item.tmdb_movie_id) ?? false}
          onClick={onClick}
          eager={index < DISPLAY_LIMITS.EAGER_TILE_MAX}
          viewMode={viewMode}
        />
      ))}
    </MovieGridContainer>
  );
});

FavoriteList.displayName = 'FavoriteList';

/**
 * FavoriteTileコンポーネントのプロパティ
 */
interface FavoriteTileProps {
  /** お気に入りアイテム */
  item: FavoriteItem;
  /** お気に入りボタンクリック時のコールバック */
  onFavoriteToggle: FavoriteListProps['onFavoriteToggle'];
  /** お気に入りボタン無効化 */
  favoriteDisabled: boolean;
  /** タイルクリック時のコールバック */
  onClick?: (tmdbMovieId: number) => void;
  /**
   * ポスターを遅延せず即時読み込みするか（既定: false）
   *
   * フォールド上のタイルは LCP 要素になりうる。先頭数件にだけ渡すこと
   * （MovieTile / WatchlistTile の同名 prop と同じ考え方）
   */
  eager?: boolean;
  /**
   * 表示モード（既定: グリッド）
   *
   * `list` では横並びへ組み替え、お気に入りボタンをポスターの重ねから
   * 行の右端へ移す（視覚順と DOM 順を揃えるため / #1050）
   */
  viewMode?: MovieViewMode;
}

/**
 * FavoriteTileコンポーネント
 */
const FavoriteTile = memo<FavoriteTileProps>(function FavoriteTile({
  item,
  onFavoriteToggle,
  favoriteDisabled,
  onClick,
  eager = false,
  viewMode = DEFAULT_MOVIE_VIEW_MODE,
}) {
  const posterUrl = getTMDbPosterUrl(item.poster_path);
  const isList = viewMode === 'list';

  const handleFavoriteToggle = useCallback(() => {
    onFavoriteToggle(
      {
        id: item.tmdb_movie_id,
        title: item.title,
        poster_path: item.poster_path,
        release_date: item.release_date,
      },
      { id: item.id, rating: item.rating },
    );
  }, [item, onFavoriteToggle]);

  // タイトルのリンクをカード全面の当たり判定にするので、左クリックだけ
  // 横取りしてモーダルで開く。修飾キー付き・中クリックは既定動作に任せる
  const handleTitleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (!onClick || shouldLetBrowserHandle(event)) {
        return;
      }

      event.preventDefault();
      onClick(item.tmdb_movie_id);
    },
    [item.tmdb_movie_id, onClick],
  );

  /**
   * お気に入りボタン
   *
   * グリッドはポスターに重ねるので `__poster` の中、リストは行の右端に置くので
   * `__info` の後ろに出す。**視覚順と DOM 順（＝ Tab 順・読み上げ順）を
   * 揃えるため**で、リストでも `__poster` の中に置くと「右端のボタン →
   * 左のタイトル」と毎行逆走する（WCAG 1.3.2 / 2.4.3）
   */
  const favoriteButton = (
    <div className={styles.c_favorite_tile__favorite_button}>
      <FavoriteButton
        favorite={{ id: item.id, rating: item.rating }}
        onClick={handleFavoriteToggle}
        disabled={favoriteDisabled}
      />
    </div>
  );

  return (
    <Card
      noPadding
      hoverable
      // カード全体を role="button" にすると、内側のお気に入りボタンが
      // インタラクティブ要素の入れ子になり ARIA 上不正になる
      // （axe: nested-interactive / #1060）。代わりにタイトルを本物のリンクに
      // し、::after でカード全面を当たり判定にする（#719 の MovieTile と同じ）
      className={cn(
        styles.c_favorite_tile,
        isList && styles['c_favorite_tile--list'],
      )}
    >
      <div className={styles.c_favorite_tile__poster}>
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={`${item.title}のポスター`}
            width={IMAGE_SIZES.POSTER.WIDTH}
            height={IMAGE_SIZES.POSTER.HEIGHT}
            // リストの枠は 56px しかない。グリッド用の 190px のままだと
            // 3倍以上大きい候補を取りに行く（#982 で sizes を入れた意図）
            sizes={
              isList
                ? `${IMAGE_SIZES.CALENDAR_POSTER.WIDTH}px`
                : IMAGE_SIZES.POSTER.SIZES
            }
            loading={eager ? 'eager' : 'lazy'}
            className={styles.c_favorite_tile__image}
          />
        ) : (
          <div className={styles.c_favorite_tile__no_image}>No Image</div>
        )}
        {!isList && favoriteButton}
      </div>
      <div className={styles.c_favorite_tile__info}>
        <h2 className={styles.c_favorite_tile__title}>
          {onClick ? (
            <Link
              href={ROUTES.MOVIE_DETAIL(item.tmdb_movie_id)}
              className={styles.c_favorite_tile__title_link}
              onClick={handleTitleClick}
            >
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </h2>
        <div className={styles.c_favorite_tile__rating}>
          {/* リスト行は 10 個のチップ（258px）が入らず、幅だけ縮んで潰れる。
              点数のチップ1つに畳む（読み上げは変わらない） */}
          <RatingIndicator rating={item.rating} size='sm' compact={isList} />
        </div>
      </div>
      {isList && (
        <div className={styles.c_favorite_tile__list_actions}>
          {favoriteButton}
        </div>
      )}
    </Card>
  );
});

FavoriteTile.displayName = 'FavoriteTile';
