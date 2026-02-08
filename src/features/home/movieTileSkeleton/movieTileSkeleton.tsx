/**
 * MovieTileSkeletonコンポーネント
 * 映画タイルのローディング表示
 */

'use client';

import { memo } from 'react';

import { Card } from '@/components/ui/card/card';
import { Skeleton } from '@/components/ui/skeleton/skeleton';

import styles from './movieTileSkeleton.module.scss';

/**
 * MovieTileSkeletonコンポーネントのプロパティ
 */
export interface MovieTileSkeletonProps {
  /** 表示数 */
  count?: number;
}

/**
 * MovieTileSkeletonコンポーネント
 */
export const MovieTileSkeleton = memo<MovieTileSkeletonProps>(
  function MovieTileSkeleton({ count = 20 }) {
    return (
      <>
        {Array.from({ length: count }, (_, index) => (
          <Card key={index} noPadding className={styles.c_movie_tile_skeleton}>
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
