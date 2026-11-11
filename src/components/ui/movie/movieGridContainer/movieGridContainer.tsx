/**
 * MovieGridContainerコンポーネント
 * 映画タイルのグリッドレイアウト・スケルトン・空状態・無限スクロールの共通パターン
 */

'use client';

import { memo, type ReactNode, type Ref } from 'react';

import { MovieTileSkeleton } from '@/components/ui/movie/movieTileSkeleton/movieTileSkeleton';
import { Loading } from '@/components/ui/loading/loading';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import {
  DEFAULT_MOVIE_VIEW_MODE,
  type MovieViewMode,
} from '@/hooks/useMovieViewMode';

import styles from './movieGridContainer.module.scss';

/**
 * MovieGridContainerコンポーネントのプロパティ
 */
export interface MovieGridContainerProps {
  /** グリッド内に表示する子要素（映画タイル等。isLoading時は不要） */
  children?: ReactNode;
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
  /**
   * グリッド要素への ref
   *
   * 双方向リストでスクロール位置を補正するために、項目の直接の親が要る
   * （`usePrependScrollAnchor`）。渡さなければ何も起きない
   */
  gridRef?: Ref<HTMLDivElement>;
  /**
   * 表示モード（既定: グリッド）
   *
   * 子に渡す `MovieTile` の `viewMode` と必ず揃えること。
   * ここだけ切り替えても、タイル側はグリッド用の縦並びのままになる
   */
  viewMode?: MovieViewMode;
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
    gridRef,
    viewMode = DEFAULT_MOVIE_VIEW_MODE,
  }) {
    const loadMoreRef = useIntersectionObserver(fetchNextPage ?? (() => {}), {
      enabled: hasNextPage && !isFetchingNextPage && !!fetchNextPage,
    });

    // 読み込み中だけグリッドに戻すと、切替直後にレイアウトが二度変わる
    const containerClassName =
      viewMode === 'list'
        ? styles.c_movie_grid_container__list
        : styles.c_movie_grid_container__grid;

    if (isLoading) {
      return (
        <div className={containerClassName}>
          <MovieTileSkeleton count={skeletonCount} viewMode={viewMode} />
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
        <div ref={gridRef} className={containerClassName}>
          {children}
        </div>

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
