/**
 * MovieGridContainerコンポーネント
 * 映画タイルのグリッドレイアウト・スケルトン・空状態・無限スクロールの共通パターン
 */

'use client';

import { memo, type ReactNode } from 'react';

import { MovieTileSkeleton } from '@/components/ui/movie/movieTileSkeleton/movieTileSkeleton';
import { Loading } from '@/components/ui/loading/loading';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';

import styles from './movieGridContainer.module.scss';

/**
 * MovieGridContainerコンポーネントのプロパティ
 */
export interface MovieGridContainerProps {
  /** グリッド内に表示する子要素（映画タイル等） */
  children: ReactNode;
  /** ローディング中 */
  isLoading: boolean;
  /** アイテムが空かどうか */
  isEmpty: boolean;
  /** 空状態のメッセージ */
  emptyMessage?: string;
  /** スケルトン表示数 */
  skeletonCount?: number;
  /** 次ページ取得中 */
  isFetchingNextPage?: boolean;
  /** 次ページが存在するか */
  hasNextPage?: boolean;
  /** 次ページ取得関数 */
  fetchNextPage?: () => void;
}

/**
 * MovieGridContainerコンポーネント
 */
export const MovieGridContainer = memo<MovieGridContainerProps>(
  function MovieGridContainer({
    children,
    isLoading,
    isEmpty,
    emptyMessage = '表示する映画がありません。',
    skeletonCount,
    isFetchingNextPage = false,
    hasNextPage = false,
    fetchNextPage,
  }) {
    const loadMoreRef = useIntersectionObserver(fetchNextPage ?? (() => {}), {
      enabled: hasNextPage && !isFetchingNextPage && !!fetchNextPage,
    });

    if (isLoading) {
      return (
        <div className={styles.c_movie_grid_container__grid}>
          <MovieTileSkeleton count={skeletonCount} />
        </div>
      );
    }

    if (isEmpty) {
      return (
        <p className={styles.c_movie_grid_container__empty}>{emptyMessage}</p>
      );
    }

    return (
      <>
        <div className={styles.c_movie_grid_container__grid}>{children}</div>

        {isFetchingNextPage && (
          <div className={styles.c_movie_grid_container__loading}>
            <Loading size='sm' label='読み込み中...' />
          </div>
        )}

        {fetchNextPage && (
          <div
            ref={loadMoreRef}
            className={styles.c_movie_grid_container__sentinel}
          />
        )}
      </>
    );
  },
);

MovieGridContainer.displayName = 'MovieGridContainer';
