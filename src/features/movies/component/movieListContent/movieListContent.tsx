/**
 * MovieListContentコンポーネント
 * 映画一覧のコンテンツ部分（タブ・ソート・フィルター・グリッド・無限スクロール）
 * upcoming / nowShowing で共有する表示コンポーネント
 */

'use client';

import { memo } from 'react';

import { Tabs } from '@/components/ui/tabs/tabs';
import { RELEASE_TYPE, RELEASE_TYPE_OPTIONS } from '@/constants';
import { FilterModal } from '@/components/ui/movie/filterModal/filterModal';
import { useOpenMovieDetail } from '@/features/movies/hooks/useMovieDetailQuery';
import { useMovieListContent } from '@/features/movies/hooks/useMovieListContent';
import type { UseMovieListReturn } from '@/features/movies/hooks/useMovieList';

import { MovieListToolbar } from './movieListToolbar';
import { MovieGrid } from './movieGrid';
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
      timeFrame,
      genres,
      selectedGenreIds,
      dateRange,
      isRevivalFilter,
      selectedWatchProviderIds,
      selectedOfferTypes,
      selectedRegions,
      hasActiveFilters,
      isFilterModalOpen,
      handleSortChange,
      handleReleaseTypeChange,
      handleFilterApply,
      handleFilterModalOpen,
      handleFilterModalClose,
    } = movieList;

    const { handleTabValueChange, handleFilterModalOpenChange } =
      useMovieListContent(
        handleReleaseTypeChange,
        handleFilterModalClose,
        handleFilterModalOpen,
      );

    /**
     * 詳細は URL（`?movie_id=`）で開く。モーダルを描くのは `AppLayout` の
     * 1箇所だけ（#1077）。
     *
     * ⚠️ `useMovieDetailQuery` ではなく `useOpenMovieDetail` を使う。
     * あちらは `useSearchParams` を読むので、開くだけの画面が使うと
     * 静的プリレンダから外れる理由を増やすだけになる（#1115）。
     */
    const openMovieDetail = useOpenMovieDetail();

    // 配信予定タブだけは「いつ配信されるか」が知りたい情報のため、
    // release_date（多くは劇場公開日）ではなくデジタル公開日を見せる
    const preferDigitalReleaseDate =
      releaseType === RELEASE_TYPE.STREAMING && timeFrame === 'upcoming';

    return (
      <div className={styles.c_movie_list}>
        <Tabs
          options={RELEASE_TYPE_OPTIONS}
          value={releaseType}
          onValueChange={handleTabValueChange}
          aria-label='リリースタイプ'
          className={styles.c_movie_list__tabs}
          contentClassName={styles.c_movie_list__panel}
        >
          <MovieListToolbar
            title={title}
            sortBy={sortBy}
            hasActiveFilters={hasActiveFilters}
            onSortChange={handleSortChange}
            onFilterModalOpen={handleFilterModalOpen}
          />

          <MovieGrid
            movies={movies}
            genres={genres}
            isLoading={isLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            fetchNextPage={fetchNextPage}
            onMovieSelect={openMovieDetail}
            preferDigitalReleaseDate={preferDigitalReleaseDate}
          />
        </Tabs>

        <FilterModal
          open={isFilterModalOpen}
          onOpenChange={handleFilterModalOpenChange}
          genres={genres}
          selectedGenreIds={selectedGenreIds}
          selectedDateRange={dateRange}
          isRevivalFilter={isRevivalFilter}
          releaseType={releaseType}
          // useMovieList の timeFrame は任意。未指定のときサーバーは
          // 'upcoming' を既定にする（moviesQuerySchema）ので、UI の
          // 選べる範囲もそれに合わせる
          timeFrame={timeFrame ?? 'upcoming'}
          selectedWatchProviderIds={selectedWatchProviderIds}
          selectedOfferTypes={selectedOfferTypes}
          selectedRegions={selectedRegions}
          onApply={handleFilterApply}
        />
      </div>
    );
  },
);

MovieListContent.displayName = 'MovieListContent';
