/**
 * MovieTileコンポーネント
 * 映画一覧のタイルアイテム
 */

'use client';

import { memo, useCallback, useMemo } from 'react';
import Image from 'next/image';

import { Card } from '@/components/ui/card/card';
import { WatchlistAddButton } from '@/features/watchlist/component/watchlistAddButton/watchlistAddButton';
import { FavoriteButton } from '@/features/favorites/component/favoriteButton/favoriteButton';
import { DismissButton } from '@/features/dismissedMovies/component/dismissButton/dismissButton';
import { getTMDbPosterUrl } from '@/utils/image';
import { IMAGE_SIZES, RATING_THRESHOLDS, DISPLAY_LIMITS } from '@/constants';
import { formatDate } from '@/utils/date';
import type { MovieCacheItem } from '@/lib/api/movies/movies';
import type { MovieFavoriteInfo } from '@/lib/api/favorites/favorites';

import styles from './movieTile.module.scss';

/**
 * MovieTileコンポーネントのプロパティ
 */
export interface MovieTileProps {
  /** 映画データ */
  movie: MovieCacheItem;
  /** ジャンルマップ */
  genres?: Record<number, string>;
  /** クリック時のコールバック */
  onClick?: (movieId: number) => void;
  /** ウォッチリストに追加済みかどうか */
  isInWatchlist?: boolean;
  /** ウォッチリストボタンクリック時のコールバック */
  onWatchlistToggle?: (movie: MovieCacheItem) => void;
  /** ウォッチリストボタン無効化 */
  watchlistDisabled?: boolean;
  /** お気に入りボタンクリック時のコールバック */
  onFavoriteToggle?: (
    movie: MovieCacheItem,
    favorite: MovieFavoriteInfo | null,
  ) => void;
  /** お気に入りボタン無効化 */
  favoriteDisabled?: boolean;
  /** 興味なしボタンクリック時のコールバック */
  onDismiss?: (movie: MovieCacheItem) => void;
  /** 興味なしボタン無効化 */
  dismissDisabled?: boolean;
  /**
   * タイトルの見出しレベル
   * 置かれるセクションの階層に合わせる（見出しレベルを飛ばさないため）
   */
  headingLevel?: 2 | 3 | 4;
  /**
   * 日付としてデジタル（配信）公開日を優先表示するか（既定: false）
   *
   * 配信予定タブ専用。`release_date` は作品につき実質1つの代表日で多くは
   * 劇場公開日が入るため、配信予定の文脈では過去日が出てしまう。
   * 劇場公開タブ・配信中タブ・他画面の表示を変えないよう、
   * 呼び出し側が明示的に有効化する
   */
  preferDigitalReleaseDate?: boolean;
}

/**
 * MovieTileコンポーネント
 */
export const MovieTile = memo<MovieTileProps>(function MovieTile({
  movie,
  genres,
  onClick,
  isInWatchlist = false,
  onWatchlistToggle,
  watchlistDisabled = false,
  onFavoriteToggle,
  favoriteDisabled = false,
  onDismiss,
  dismissDisabled = false,
  headingLevel = 3,
  preferDigitalReleaseDate = false,
}) {
  const Title = `h${headingLevel}` as const;

  const handleClick = useCallback(() => {
    onClick?.(movie.id);
  }, [movie.id, onClick]);

  const handleWatchlistToggle = useCallback(() => {
    onWatchlistToggle?.(movie);
  }, [movie, onWatchlistToggle]);

  const handleFavoriteToggle = useCallback(() => {
    onFavoriteToggle?.(movie, movie.favorite ?? null);
  }, [movie, onFavoriteToggle]);

  const handleDismiss = useCallback(() => {
    onDismiss?.(movie);
  }, [movie, onDismiss]);

  const posterUrl = getTMDbPosterUrl(movie.poster_path);

  // デジタル公開日を優先する場合でも、未登録なら従来どおり release_date を出す
  const displayDate =
    (preferDigitalReleaseDate ? movie.digital_release_date : null) ??
    movie.release_date;
  const formattedDate = displayDate ? formatDate(displayDate) : null;

  const ratingClassName = useMemo(() => {
    if (movie.vote_average == null || movie.vote_average <= 0) return '';
    if (movie.vote_average >= RATING_THRESHOLDS.HIGH)
      return styles.c_movie_tile__rating__high;
    if (movie.vote_average >= RATING_THRESHOLDS.MID)
      return styles.c_movie_tile__rating__mid;
    return styles.c_movie_tile__rating__low;
  }, [movie.vote_average]);

  const genreNames = useMemo(() => {
    if (!genres || !movie.genre_ids || movie.genre_ids.length === 0) {
      return [];
    }
    return movie.genre_ids
      .slice(0, DISPLAY_LIMITS.GENRE_MAX)
      .map((id) => genres[id])
      .filter(Boolean);
  }, [genres, movie.genre_ids]);

  return (
    // カード全体を role="button" にすると、内側のお気に入り等のボタンが
    // インタラクティブ要素の入れ子になり ARIA 上不正になる（axe: nested-interactive）。
    // 代わりにタイトルを本物の button にし、::after でカード全面を当たり判定にする。
    <Card hoverable noPadding className={styles.c_movie_tile}>
      <div className={styles.c_movie_tile__poster}>
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={`${movie.title}のポスター`}
            width={IMAGE_SIZES.POSTER.WIDTH}
            height={IMAGE_SIZES.POSTER.HEIGHT}
            className={styles.c_movie_tile__image}
          />
        ) : (
          <div className={styles.c_movie_tile__no_image}>No Image</div>
        )}
        {movie.is_revival && (
          <span className={styles.c_movie_tile__revival}>リバイバル</span>
        )}
        {onDismiss && (
          <div className={styles.c_movie_tile__dismiss_button}>
            <DismissButton onClick={handleDismiss} disabled={dismissDisabled} />
          </div>
        )}
        {onFavoriteToggle && (
          <div className={styles.c_movie_tile__favorite_button}>
            <FavoriteButton
              favorite={movie.favorite ?? null}
              onClick={handleFavoriteToggle}
              disabled={favoriteDisabled}
            />
          </div>
        )}
        {onWatchlistToggle && (
          <div className={styles.c_movie_tile__watchlist_button}>
            <WatchlistAddButton
              isInWatchlist={isInWatchlist}
              onClick={handleWatchlistToggle}
              disabled={watchlistDisabled}
            />
          </div>
        )}
      </div>
      <div className={styles.c_movie_tile__info}>
        <Title className={styles.c_movie_tile__title}>
          <button
            type='button'
            className={styles.c_movie_tile__title_button}
            onClick={handleClick}
          >
            {movie.title}
          </button>
        </Title>
        {genreNames.length > 0 && (
          <div className={styles.c_movie_tile__genres}>
            {genreNames.map((name) => (
              <span key={name} className={styles.c_movie_tile__genre_tag}>
                {name}
              </span>
            ))}
          </div>
        )}
        <div className={styles.c_movie_tile__footer}>
          {formattedDate && (
            <p className={styles.c_movie_tile__date}>{formattedDate}</p>
          )}
          {movie.vote_average != null && movie.vote_average > 0 && (
            <span
              className={`${styles.c_movie_tile__rating} ${ratingClassName}`}
            >
              {movie.vote_average.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
});

MovieTile.displayName = 'MovieTile';
