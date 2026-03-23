/**
 * 受賞作品 カテゴリセクションコンポーネント
 * 部門ごとの受賞映画・ノミネート映画を表示
 */

'use client';

import { memo, useMemo } from 'react';

import { MovieTile } from '@/components/ui/movie/movieTile/movieTile';
import type { MovieCacheItem } from '@/lib/api/movies/movies';
import type { MovieFavoriteInfo } from '@/lib/api/favorites/favorites';
import type { AwardCategoryData } from '@/features/awards/types';
import { awardMovieToMovieCacheItem } from '@/utils/toMovieCacheItem';

import styles from './awardCategorySection.module.scss';

export interface AwardCategorySectionProps {
  category: AwardCategoryData;
  onMovieClick: (movieId: number) => void;
  isInWatchlist: (tmdbMovieId: number) => boolean;
  onWatchlistToggle: (movie: MovieCacheItem) => void;
  isMovieToggling: (tmdbMovieId: number) => boolean;
  onFavoriteToggle: (
    movie: MovieCacheItem,
    favorite: MovieFavoriteInfo | null,
  ) => void;
  isFavoriteProcessing: (tmdbMovieId: number) => boolean;
}

export const AwardCategorySection = memo<AwardCategorySectionProps>(
  function AwardCategorySection({
    category,
    onMovieClick,
    isInWatchlist,
    onWatchlistToggle,
    isMovieToggling,
    onFavoriteToggle,
    isFavoriteProcessing,
  }) {
    const winnerCacheItem = useMemo(
      () =>
        category.winner ? awardMovieToMovieCacheItem(category.winner) : null,
      [category.winner],
    );

    const nomineeCacheItems = useMemo(
      () =>
        category.nominees
          .filter(
            (nominee) =>
              !category.winner ||
              nominee.tmdbMovieId !== category.winner.tmdbMovieId,
          )
          .map(awardMovieToMovieCacheItem),
      [category.nominees, category.winner],
    );

    const personNameMap = useMemo(() => {
      const map = new Map<number, string>();
      for (const nominee of category.nominees) {
        if (nominee.personName) {
          map.set(nominee.tmdbMovieId, nominee.personName);
        }
      }
      return map;
    }, [category.nominees]);

    return (
      <div id={`category-${category.category}`} className={styles.c_award_category}>
        <h3 className={styles.c_award_category__title}>{category.label}</h3>

        {winnerCacheItem && (
          <div className={styles.c_award_category__winner}>
            <span className={styles.c_award_category__winner_label}>受賞</span>
            <div className={styles.c_award_category__winner_tile}>
              <MovieTile
                movie={winnerCacheItem}
                onClick={onMovieClick}
                isInWatchlist={isInWatchlist(winnerCacheItem.id)}
                onWatchlistToggle={onWatchlistToggle}
                watchlistDisabled={isMovieToggling(winnerCacheItem.id)}
                onFavoriteToggle={onFavoriteToggle}
                favoriteDisabled={isFavoriteProcessing(winnerCacheItem.id)}
              />
              {personNameMap.get(winnerCacheItem.id) && (
                <p className={styles.c_award_category__person_name}>
                  {personNameMap.get(winnerCacheItem.id)}
                </p>
              )}
            </div>
          </div>
        )}

        {nomineeCacheItems.length > 0 && (
          <div className={styles.c_award_category__nominees}>
            <span className={styles.c_award_category__nominees_label}>
              ノミネート
            </span>
            <div className={styles.c_award_category__grid} role='list'>
              {nomineeCacheItems.map((movie) => (
                <div
                  key={movie.id}
                  role='listitem'
                  className={styles.c_award_category__item}
                >
                  <MovieTile
                    movie={movie}
                    onClick={onMovieClick}
                    isInWatchlist={isInWatchlist(movie.id)}
                    onWatchlistToggle={onWatchlistToggle}
                    watchlistDisabled={isMovieToggling(movie.id)}
                    onFavoriteToggle={onFavoriteToggle}
                    favoriteDisabled={isFavoriteProcessing(movie.id)}
                  />
                  {personNameMap.get(movie.id) && (
                    <p className={styles.c_award_category__person_name}>
                      {personNameMap.get(movie.id)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  },
);

AwardCategorySection.displayName = 'AwardCategorySection';
