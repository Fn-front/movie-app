/**
 * FavoriteListコンポーネント
 * お気に入り映画のグリッド一覧表示
 */

'use client';

import { memo, useCallback } from 'react';
import Image from 'next/image';

import { Card } from '@/components/ui/card/card';
import { RatingIndicator } from '@/features/favorites/component/ratingIndicator/ratingIndicator';
import { FavoriteButton } from '@/features/favorites/component/favoriteButton/favoriteButton';
import { MovieTileSkeleton } from '@/components/ui/movie/movieTileSkeleton/movieTileSkeleton';
import { getTMDbPosterUrl } from '@/utils/image';
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
  /** お気に入りボタン無効化 */
  favoriteDisabled?: boolean;
}

/**
 * FavoriteListコンポーネント
 */
export const FavoriteList = memo<FavoriteListProps>(function FavoriteList({
  favorites,
  isLoading,
  onFavoriteToggle,
  favoriteDisabled = false,
}) {
  if (isLoading) {
    return (
      <div className={styles.c_favorite_list__grid}>
        <MovieTileSkeleton count={8} />
      </div>
    );
  }

  if (favorites.length === 0) {
    return (
      <p className={styles.c_favorite_list__empty}>
        お気に入りの映画を追加しましょう
      </p>
    );
  }

  return (
    <div className={styles.c_favorite_list__grid}>
      {favorites.map((item) => (
        <FavoriteTile
          key={item.id}
          item={item}
          onFavoriteToggle={onFavoriteToggle}
          favoriteDisabled={favoriteDisabled}
        />
      ))}
    </div>
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
}

/**
 * FavoriteTileコンポーネント
 */
const FavoriteTile = memo<FavoriteTileProps>(function FavoriteTile({
  item,
  onFavoriteToggle,
  favoriteDisabled,
}) {
  const posterUrl = getTMDbPosterUrl(item.poster_path);

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

  return (
    <Card noPadding className={styles.c_favorite_tile}>
      <div className={styles.c_favorite_tile__poster}>
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={`${item.title}のポスター`}
            width={500}
            height={750}
            className={styles.c_favorite_tile__image}
          />
        ) : (
          <div className={styles.c_favorite_tile__no_image}>No Image</div>
        )}
        <div className={styles.c_favorite_tile__favorite_button}>
          <FavoriteButton
            favorite={{ id: item.id, rating: item.rating }}
            onClick={handleFavoriteToggle}
            disabled={favoriteDisabled}
          />
        </div>
      </div>
      <div className={styles.c_favorite_tile__info}>
        <h3 className={styles.c_favorite_tile__title}>{item.title}</h3>
        <div className={styles.c_favorite_tile__rating}>
          <RatingIndicator rating={item.rating} size='sm' />
        </div>
      </div>
    </Card>
  );
});

FavoriteTile.displayName = 'FavoriteTile';
