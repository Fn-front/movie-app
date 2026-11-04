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
  awardName: string;
  onMovieClick: (movieId: number) => void;
  isInWatchlist: (tmdbMovieId: number) => boolean;
  onWatchlistToggle: (movie: MovieCacheItem) => void;
  isMovieToggling: (tmdbMovieId: number) => boolean;
  onFavoriteToggle: (
    movie: MovieCacheItem,
    favorite: MovieFavoriteInfo | null,
  ) => void;
  isFavoriteProcessing: (tmdbMovieId: number) => boolean;
  /**
   * このセクションがページ先頭かどうか（既定: false）
   *
   * 先頭カテゴリの受賞作タイルだけがフォールド上に来るため、そこだけ
   * ポスターを即時読み込みする。2件目以降のカテゴリは遅延のままにする
   */
  isFirstSection?: boolean;
}

export const AwardCategorySection = memo<AwardCategorySectionProps>(
  function AwardCategorySection({
    category,
    awardName,
    onMovieClick,
    isInWatchlist,
    onWatchlistToggle,
    isMovieToggling,
    onFavoriteToggle,
    isFavoriteProcessing,
    isFirstSection = false,
  }) {
    const { winners, nominees } = useMemo(() => {
      const entries = category.nominees.map((award) => ({
        /**
         * 行を一意に識別するキー
         *
         * 同じ作品から複数人がノミネートされるため、映画IDだけでは衝突する
         * （DBの一意キーも映画・部門・人名の組）
         */
        key: `${award.tmdbMovieId}:${award.personName ?? ''}`,
        award,
        movie: awardMovieToMovieCacheItem(award),
      }));

      return {
        winners: entries.filter((e) => e.award.isWinner),
        nominees: entries.filter((e) => !e.award.isWinner),
      };
    }, [category.nominees]);

    // 一覧とラベルを紐づける。同点受賞で複数枚並ぶため、
    // 「受賞」ラベルの隣接だけでは2枚目以降が受賞だと伝わらない
    const sectionId = `category-${awardName}-${category.category}`;
    const winnerLabelId = `${sectionId}-winner-label`;
    const nomineeLabelId = `${sectionId}-nominee-label`;

    return (
      <div id={sectionId} className={styles.c_award_category}>
        <h3 className={styles.c_award_category__title}>{category.label}</h3>

        {winners.length > 0 && (
          <div className={styles.c_award_category__winner}>
            <span
              id={winnerLabelId}
              className={styles.c_award_category__winner_label}
            >
              受賞
            </span>
            <div
              className={styles.c_award_category__winner_tiles}
              role='list'
              aria-labelledby={winnerLabelId}
            >
              {winners.map(({ key, award, movie }) => (
                <div
                  key={key}
                  role='listitem'
                  className={styles.c_award_category__winner_tile}
                >
                  <MovieTile
                    movie={movie}
                    headingLevel={4}
                    eager={isFirstSection}
                    onClick={onMovieClick}
                    isInWatchlist={isInWatchlist(movie.id)}
                    onWatchlistToggle={onWatchlistToggle}
                    watchlistDisabled={isMovieToggling(movie.id)}
                    onFavoriteToggle={onFavoriteToggle}
                    favoriteDisabled={isFavoriteProcessing(movie.id)}
                  />
                  {award.personName && (
                    <p className={styles.c_award_category__person_name}>
                      {award.personName}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {nominees.length > 0 && (
          <div className={styles.c_award_category__nominees}>
            <span
              id={nomineeLabelId}
              className={styles.c_award_category__nominees_label}
            >
              ノミネート
            </span>
            <div
              className={styles.c_award_category__grid}
              role='list'
              aria-labelledby={nomineeLabelId}
            >
              {nominees.map(({ key, award, movie }) => (
                <div
                  key={key}
                  role='listitem'
                  className={styles.c_award_category__item}
                >
                  <MovieTile
                    movie={movie}
                    onClick={onMovieClick}
                    isInWatchlist={isInWatchlist(movie.id)}
                    headingLevel={4}
                    onWatchlistToggle={onWatchlistToggle}
                    watchlistDisabled={isMovieToggling(movie.id)}
                    onFavoriteToggle={onFavoriteToggle}
                    favoriteDisabled={isFavoriteProcessing(movie.id)}
                  />
                  {award.personName && (
                    <p className={styles.c_award_category__person_name}>
                      {award.personName}
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
