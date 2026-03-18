/**
 * MovieContentコンポーネント
 * 映画一覧のコンテンツ部分（タブ・ソート・フィルター・グリッド・無限スクロール）
 * データ更新時のレンダリング範囲をこのコンポーネント内に限定する
 */

'use client';

import { memo, useMemo, useCallback } from 'react';

import { Tabs } from '@/components/ui/tabs/tabs';
import { Select } from '@/components/ui/select/select';
import { Button } from '@/components/ui/button/button';
import { FilterIcon } from '@/components/icons/filterIcon/filterIcon';
import { SORT_OPTIONS, RELEASE_TYPE_OPTIONS } from '@/constants';
import { MovieTile } from '@/components/ui/movie/movieTile/movieTile';
import { MovieGridContainer } from '@/components/ui/movie/movieGridContainer/movieGridContainer';
import { FilterModal } from '@/components/ui/movie/filterModal/filterModal';
import { useWatchlistToggle } from '@/features/watchlist/hooks/useWatchlistToggle';

import { useHome } from '@/features/home/hooks/useHome';
import styles from '@/features/home/home.module.scss';

/**
 * MovieContentコンポーネント
 */
export const MovieContent = memo(function MovieContent() {
  const {
    movies,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    sortBy,
    releaseType,
    genres,
    selectedGenreIds,
    dateRange,
    isRevivalFilter,
    isFilterModalOpen,
    handleSortChange,
    handleReleaseTypeChange,
    handleFilterApply,
    handleFilterModalOpen,
    handleFilterModalClose,
  } = useHome();

  const { isInWatchlist, toggleWatchlist, isMovieToggling } =
    useWatchlistToggle();

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
            aria-label='フィルター'
            className={styles.c_home_page__filter_button}
          >
            <FilterIcon />
            {(selectedGenreIds.length > 0 ||
              dateRange.gte ||
              dateRange.lte ||
              isRevivalFilter !== undefined) && (
              <span className={styles.c_home_page__filter_count} />
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

      <MovieGridContainer
        isLoading={isLoading}
        isEmpty={movies.length === 0}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
      >
        {movies.map((movie) => (
          <MovieTile
            key={movie.id}
            movie={movie}
            genres={genres}
            isInWatchlist={isInWatchlist(movie.id)}
            onWatchlistToggle={toggleWatchlist}
            watchlistDisabled={isMovieToggling(movie.id)}
          />
        ))}
      </MovieGridContainer>

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
});

MovieContent.displayName = 'MovieContent';
