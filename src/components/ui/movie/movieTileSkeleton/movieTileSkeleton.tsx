/**
 * MovieTileSkeletonコンポーネント
 * 映画タイルのローディング表示
 */

'use client';

import { memo } from 'react';

import { Card } from '@/components/ui/card/card';
import { Skeleton } from '@/components/ui/skeleton/skeleton';
import { DISPLAY_LIMITS } from '@/constants';
import {
  DEFAULT_MOVIE_VIEW_MODE,
  type MovieViewMode,
} from '@/hooks/useMovieViewMode';
import { cn } from '@/utils/cn';

import styles from './movieTileSkeleton.module.scss';

/**
 * MovieTileSkeletonコンポーネントのプロパティ
 */
export interface MovieTileSkeletonProps {
  /** 表示数 */
  count?: number;
  /** 表示モード（既定: グリッド）。読み込み後の `MovieTile` と揃える */
  viewMode?: MovieViewMode;
}

/**
 * MovieTileSkeletonコンポーネント
 */
export const MovieTileSkeleton = memo<MovieTileSkeletonProps>(
  function MovieTileSkeleton({
    count = DISPLAY_LIMITS.SKELETON_DEFAULT,
    viewMode = DEFAULT_MOVIE_VIEW_MODE,
  }) {
    const className = cn(
      styles.c_movie_tile_skeleton,
      viewMode === 'list' && styles['c_movie_tile_skeleton--list'],
    );

    return (
      <>
        {Array.from({ length: count }, (_, index) => (
          <Card key={index} noPadding className={className}>
            <Skeleton
              variant='rect'
              width='100%'
              className={styles.c_movie_tile_skeleton__poster}
            />
            <div className={styles.c_movie_tile_skeleton__info}>
              <Skeleton variant='text' width='80%' height='16px' />
              <Skeleton variant='text' width='50%' height='12px' />
            </div>
          </Card>
        ))}
      </>
    );
  },
);

MovieTileSkeleton.displayName = 'MovieTileSkeleton';
