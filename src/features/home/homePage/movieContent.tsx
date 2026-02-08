/**
 * MovieContentコンポーネント
 * 映画一覧のコンテンツ部分（ソート・グリッド・ページネーション）
 * データ更新時のレンダリング範囲をこのコンポーネント内に限定する
 */

'use client';

import { memo, useMemo } from 'react';

import { Select } from '@/components/ui/select/select';
import { Pagination } from '@/components/ui/pagination/pagination';
import { SORT_OPTIONS } from '@/constants';
import { MovieTile } from '@/features/home/movieTile/movieTile';
import { MovieTileSkeleton } from '@/features/home/movieTileSkeleton/movieTileSkeleton';

import { useHomePage } from './useHomePage';
import styles from './homePage.module.scss';

/**
 * MovieContentコンポーネント
 */
export const MovieContent = memo(function MovieContent() {
  const {
    movies,
    pagination,
    isLoading,
    sortBy,
    handlePageChange,
    handleSortChange,
  } = useHomePage();

  const sortOptions = useMemo(
    () =>
      SORT_OPTIONS.map((option) => ({
        label: option.label,
        value: option.value,
      })),
    [],
  );

  return (
    <div className={styles.c_home_page}>
      <div className={styles.c_home_page__toolbar}>
        <h2 className={styles.c_home_page__title}>公開予定の映画</h2>
        <Select
          options={sortOptions}
          value={sortBy}
          onValueChange={handleSortChange}
          aria-label='ソート順を選択'
          className={styles.c_home_page__sort}
        />
      </div>

      <div className={styles.c_home_page__grid}>
        {isLoading ? (
          <MovieTileSkeleton />
        ) : (
          movies.map((movie) => (
            <MovieTile key={movie.id} movie={movie} />
          ))
        )}
      </div>

      {!isLoading && movies.length === 0 && (
        <p className={styles.c_home_page__empty}>
          表示する映画がありません。
        </p>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className={styles.c_home_page__pagination}>
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      )}
    </div>
  );
});

MovieContent.displayName = 'MovieContent';
