/**
 * MovieListContentコンポーネント
 * 映画一覧のコンテンツ部分（タブ・ソート・フィルター・グリッド・無限スクロール）
 * upcoming / nowShowing で共有する表示コンポーネント
 */

'use client';

import { memo, useMemo, useCallback, useState } from 'react';

import { Tabs } from '@/components/ui/tabs/tabs';
import { Select } from '@/components/ui/select/select';
import { Button } from '@/components/ui/button/button';
import { FilterIcon } from '@/components/icons/filterIcon/filterIcon';
import { Loading } from '@/components/ui/loading/loading';
import { SORT_OPTIONS, RELEASE_TYPE_OPTIONS } from '@/constants';
import { MovieTile } from '@/features/movies/component/movieTile/movieTile';
import { MovieTileSkeleton } from '@/features/movies/component/movieTileSkeleton/movieTileSkeleton';
import { FilterModal } from '@/features/movies/component/filterModal/filterModal';
import { MovieDetailModal } from '@/features/movies/component/movieDetailModal/movieDetailModal';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
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

    const [selectedMovieId, setSelectedMovieId] = useState<number | null>(null);
    const [showFinancialInfo, setShowFinancialInfo] = useState(false);

    const handleMovieTileClick = useCallback(
      (movieId: number) => {
        setSelectedMovieId(movieId);
        const movie = movies.find((m) => m.id === movieId);
        const isReleased =
          movie?.release_date !== undefined &&
          movie.release_date !== null &&
          new Date(movie.release_date) < new Date();
        setShowFinancialInfo(isReleased || movie?.is_revival === true);
      },
      [movies],
    );

    const handleDetailModalClose = useCallback(() => {
      setSelectedMovieId(null);
      setShowFinancialInfo(false);
    }, []);

    const loadMoreRef = useIntersectionObserver(fetchNextPage, {
      enabled: hasNextPage && !isFetchingNextPage,
    });

    return (
      <div className={styles.c_movie_list}>
        <Tabs
          options={RELEASE_TYPE_OPTIONS}
          value={releaseType}
          onValueChange={handleTabValueChange}
          aria-label='リリースタイプ'
        />

        <div className={styles.c_movie_list__toolbar}>
          <h2 className={styles.c_movie_list__title}>{title}</h2>
          <div className={styles.c_movie_list__controls}>
            <Button
              variant='ghost'
              size='sm'
              onClick={handleFilterModalOpen}
              aria-label='フィルター'
              className={styles.c_movie_list__filter_button}
            >
              <span className={styles.c_movie_list__filter_inner}>
                <FilterIcon />
                {(selectedGenreIds.length > 0 ||
                  dateRange.gte ||
                  dateRange.lte ||
                  isRevivalFilter !== undefined) && (
                  <span className={styles.c_movie_list__filter_count} />
                )}
              </span>
            </Button>
            <Select
              options={sortOptions}
              value={sortBy}
              onValueChange={handleSortChange}
              aria-label='ソート順を選択'
              className={styles.c_movie_list__sort}
            />
          </div>
        </div>

        <div className={styles.c_movie_list__grid}>
          {isLoading ? (
            <MovieTileSkeleton />
          ) : (
            movies.map((movie) => (
              <MovieTile
                key={movie.id}
                movie={movie}
                genres={genres}
                onClick={handleMovieTileClick}
              />
            ))
          )}
        </div>

        {!isLoading && movies.length === 0 && (
          <p className={styles.c_movie_list__empty}>
            表示する映画がありません。
          </p>
        )}

        {isFetchingNextPage && (
          <div className={styles.c_movie_list__loading}>
            <Loading size='sm' label='読み込み中...' />
          </div>
        )}

        <div ref={loadMoreRef} className={styles.c_movie_list__sentinel} />

        <FilterModal
          open={isFilterModalOpen}
          onOpenChange={handleFilterModalOpenChange}
          genres={genres}
          selectedGenreIds={selectedGenreIds}
          selectedDateRange={dateRange}
          isRevivalFilter={isRevivalFilter}
          onApply={handleFilterApply}
        />

        <MovieDetailModal
          movieId={selectedMovieId}
          showFinancialInfo={showFinancialInfo}
          onClose={handleDetailModalClose}
        />
      </div>
    );
  },
);

MovieListContent.displayName = 'MovieListContent';
