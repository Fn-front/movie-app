/**
 * MovieListContentコンポーネント
 * 映画一覧のコンテンツ部分（タブ・ソート・フィルター・グリッド・ページネーション）
 * upcoming / nowShowing で共有する表示コンポーネント
 */

'use client';

import { memo, useMemo, useCallback } from 'react';

import { Tabs } from '@/components/ui/tabs/tabs';
import { Select } from '@/components/ui/select/select';
import { Pagination } from '@/components/ui/pagination/pagination';
import { Button } from '@/components/ui/button/button';
import { FilterIcon } from '@/components/icons/filterIcon/filterIcon';
import { SORT_OPTIONS, RELEASE_TYPE_OPTIONS } from '@/constants';
import { MovieTile } from '@/features/movies/component/movieTile/movieTile';
import { MovieTileSkeleton } from '@/features/movies/component/movieTileSkeleton/movieTileSkeleton';
import { FilterModal } from '@/features/movies/component/filterModal/filterModal';
import type { UseMovieListReturn } from '@/features/movies/hooks/useMovieList';

import styles from './movieListContent.module.scss';

/**
 * MovieListContentコンポーネントのプロパティ
 */
export interface MovieListContentProps {
  /** ページタイトル */
  title: string;
  /** useMovieListフックの返り値 */
  movieList: UseMovieListReturn;
}

/**
 * MovieListContentコンポーネント
 */
export const MovieListContent = memo<MovieListContentProps>(
  function MovieListContent({ title, movieList }) {
    const {
      movies,
      pagination,
      isLoading,
      sortBy,
      releaseType,
      genres,
      selectedGenreIds,
      dateRange,
      isRevivalFilter,
      isFilterModalOpen,
      handlePageChange,
      handleSortChange,
      handleReleaseTypeChange,
      handleFilterApply,
      handleFilterModalOpen,
      handleFilterModalClose,
    } = movieList;

    const sortOptions = useMemo(
      () =>
        SORT_OPTIONS.map((option) => ({
          label: option.label,
          value: option.value,
        })),
      [],
    );

    const handleTabValueChange = useCallback(
      (value: string) => {
        handleReleaseTypeChange(value as 'theatrical' | 'streaming');
      },
      [handleReleaseTypeChange],
    );

    const handleFilterModalOpenChange = useCallback(
      (open: boolean) => {
        if (!open) {
          handleFilterModalClose();
        }
      },
      [handleFilterModalClose],
    );

    return (
      <div className={styles.c_movie_list}>
        <Tabs
          options={RELEASE_TYPE_OPTIONS}
          value={releaseType}
          onValueChange={handleTabValueChange}
          aria-label="リリースタイプ"
        />

        <div className={styles.c_movie_list__toolbar}>
          <h2 className={styles.c_movie_list__title}>{title}</h2>
          <div className={styles.c_movie_list__controls}>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleFilterModalOpen}
              aria-label="フィルター"
              className={styles.c_movie_list__filter_button}
            >
              <FilterIcon />
              {(selectedGenreIds.length > 0 ||
                dateRange.gte ||
                dateRange.lte ||
                isRevivalFilter !== undefined) && (
                <span className={styles.c_movie_list__filter_count} />
              )}
            </Button>
            <Select
              options={sortOptions}
              value={sortBy}
              onValueChange={handleSortChange}
              aria-label="ソート順を選択"
              className={styles.c_movie_list__sort}
            />
          </div>
        </div>

        <div className={styles.c_movie_list__grid}>
          {isLoading ? (
            <MovieTileSkeleton />
          ) : (
            movies.map((movie) => (
              <MovieTile key={movie.id} movie={movie} genres={genres} />
            ))
          )}
        </div>

        {!isLoading && movies.length === 0 && (
          <p className={styles.c_movie_list__empty}>
            表示する映画がありません。
          </p>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className={styles.c_movie_list__pagination}>
            <Pagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        )}

        <FilterModal
          open={isFilterModalOpen}
          onOpenChange={handleFilterModalOpenChange}
          genres={genres}
          selectedGenreIds={selectedGenreIds}
          selectedDateRange={dateRange}
          isRevivalFilter={isRevivalFilter}
          onApply={handleFilterApply}
        />
      </div>
    );
  },
);

MovieListContent.displayName = 'MovieListContent';
