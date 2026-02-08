/**
 * MovieContentコンポーネント
 * 映画一覧のコンテンツ部分（タブ・ソート・フィルター・グリッド・ページネーション）
 * データ更新時のレンダリング範囲をこのコンポーネント内に限定する
 */

'use client';

import { memo, useMemo, useCallback } from 'react';

import { Tabs } from '@/components/ui/tabs/tabs';
import { Select } from '@/components/ui/select/select';
import { Pagination } from '@/components/ui/pagination/pagination';
import { Button } from '@/components/ui/button/button';
import { FilterIcon } from '@/components/icons/filterIcon/filterIcon';
import { SORT_OPTIONS, RELEASE_TYPE_OPTIONS } from '@/constants';
import { MovieTile } from '@/features/home/movieTile/movieTile';
import { MovieTileSkeleton } from '@/features/home/movieTileSkeleton/movieTileSkeleton';
import { GenreFilterModal } from '@/features/home/genreFilterModal/genreFilterModal';

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
    releaseType,
    genres,
    selectedGenreIds,
    isFilterModalOpen,
    handlePageChange,
    handleSortChange,
    handleReleaseTypeChange,
    handleGenreFilterApply,
    handleFilterModalOpen,
    handleFilterModalClose,
  } = useHomePage();

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
    <div className={styles.c_home_page}>
      <Tabs
        options={RELEASE_TYPE_OPTIONS}
        value={releaseType}
        onValueChange={handleTabValueChange}
        aria-label='リリースタイプ'
      />

      <div className={styles.c_home_page__toolbar}>
        <h2 className={styles.c_home_page__title}>公開予定の映画</h2>
        <div className={styles.c_home_page__controls}>
          <Button
            variant='ghost'
            size='sm'
            onClick={handleFilterModalOpen}
            aria-label='ジャンルフィルター'
            className={styles.c_home_page__filter_button}
          >
            <FilterIcon />
            {selectedGenreIds.length > 0 && (
              <span className={styles.c_home_page__filter_count}>
                {selectedGenreIds.length}
              </span>
            )}
          </Button>
          <Select
            options={sortOptions}
            value={sortBy}
            onValueChange={handleSortChange}
            aria-label='ソート順を選択'
            className={styles.c_home_page__sort}
          />
        </div>
      </div>

      <div className={styles.c_home_page__grid}>
        {isLoading ? (
          <MovieTileSkeleton />
        ) : (
          movies.map((movie) => (
            <MovieTile key={movie.id} movie={movie} genres={genres} />
          ))
        )}
      </div>

      {!isLoading && movies.length === 0 && (
        <p className={styles.c_home_page__empty}>表示する映画がありません。</p>
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

      <GenreFilterModal
        open={isFilterModalOpen}
        onOpenChange={handleFilterModalOpenChange}
        genres={genres}
        selectedGenreIds={selectedGenreIds}
        onApply={handleGenreFilterApply}
      />
    </div>
  );
});

MovieContent.displayName = 'MovieContent';
