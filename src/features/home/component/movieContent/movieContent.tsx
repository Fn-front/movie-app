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
import { Loading } from '@/components/ui/loading/loading';
import { SORT_OPTIONS, RELEASE_TYPE_OPTIONS } from '@/constants';
import { MovieTile } from '@/features/home/component/movieTile/movieTile';
import { MovieTileSkeleton } from '@/features/home/component/movieTileSkeleton/movieTileSkeleton';
import { FilterModal } from '@/features/home/component/filterModal/filterModal';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { useWatchlist } from '@/features/watchlist/hooks/useWatchlist';
import { useToast } from '@/hooks/useToast';
import type { MovieCacheItem } from '@/lib/api/movies/movies';

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

  const {
    isInWatchlist,
    getWatchlistId,
    addToWatchlist,
    removeFromWatchlist,
    isAdding,
    isRemoving,
  } = useWatchlist();
  const { toast } = useToast();

  const handleWatchlistToggle = useCallback(
    (movie: MovieCacheItem) => {
      if (isInWatchlist(movie.id)) {
        const watchlistId = getWatchlistId(movie.id);
        if (watchlistId) {
          removeFromWatchlist(watchlistId);
          toast({
            title: 'ウォッチリストから削除しました',
            variant: 'success',
          });
        }
      } else {
        addToWatchlist({
          tmdb_movie_id: movie.id,
          title: movie.title,
          poster_path: movie.poster_path,
          release_date: movie.release_date,
        });
        toast({
          title: 'ウォッチリストに追加しました',
          variant: 'success',
        });
      }
    },
    [isInWatchlist, getWatchlistId, addToWatchlist, removeFromWatchlist, toast],
  );

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

  const loadMoreRef = useIntersectionObserver(fetchNextPage, {
    enabled: hasNextPage && !isFetchingNextPage,
  });

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

      <div className={styles.c_home_page__grid}>
        {isLoading ? (
          <MovieTileSkeleton />
        ) : (
          movies.map((movie) => (
            <MovieTile
              key={movie.id}
              movie={movie}
              genres={genres}
              isInWatchlist={isInWatchlist(movie.id)}
              onWatchlistToggle={handleWatchlistToggle}
              watchlistDisabled={isAdding || isRemoving}
            />
          ))
        )}
      </div>

      {!isLoading && movies.length === 0 && (
        <p className={styles.c_home_page__empty}>表示する映画がありません。</p>
      )}

      {isFetchingNextPage && (
        <div className={styles.c_home_page__loading}>
          <Loading size='sm' label='読み込み中...' />
        </div>
      )}

      <div ref={loadMoreRef} className={styles.c_home_page__sentinel} />

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
