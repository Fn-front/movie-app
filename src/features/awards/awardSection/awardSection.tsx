/**
 * 受賞作品 賞セクションコンポーネント
 * 賞名ヘッダーとカテゴリ一覧を表示
 */

'use client';

import { memo } from 'react';

import type { MovieCacheItem } from '@/lib/api/movies/movies';
import type { MovieFavoriteInfo } from '@/lib/api/favorites/favorites';
import type { AwardData } from '@/features/awards/types';
import { AwardCategorySection } from '@/features/awards/awardCategorySection/awardCategorySection';

import styles from './awardSection.module.scss';

export interface AwardSectionProps {
  award: AwardData;
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

export const AwardSection = memo<AwardSectionProps>(function AwardSection({
  award,
  onMovieClick,
  isInWatchlist,
  onWatchlistToggle,
  isMovieToggling,
  onFavoriteToggle,
  isFavoriteProcessing,
}) {
  return (
    <section className={styles.c_award_section} aria-label={award.label}>
      <h2 className={styles.c_award_section__title}>{award.label}</h2>
      <div className={styles.c_award_section__categories}>
        {award.categories.map((category) => (
          <AwardCategorySection
            key={category.category}
            category={category}
            onMovieClick={onMovieClick}
            isInWatchlist={isInWatchlist}
            onWatchlistToggle={onWatchlistToggle}
            isMovieToggling={isMovieToggling}
            onFavoriteToggle={onFavoriteToggle}
            isFavoriteProcessing={isFavoriteProcessing}
          />
        ))}
      </div>
    </section>
  );
});

AwardSection.displayName = 'AwardSection';
