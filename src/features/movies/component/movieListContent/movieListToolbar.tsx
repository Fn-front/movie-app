/**
 * MovieListToolbarコンポーネント
 * ツールバー部分（タイトル・フィルターボタン・ソート選択）
 */

'use client';

import { memo } from 'react';

import { Button } from '@/components/ui/button/button';
import { Select } from '@/components/ui/select/select';
import { FilterIcon } from '@/components/icons/filterIcon/filterIcon';
import { SORT_OPTIONS } from '@/constants';

import styles from './movieListContent.module.scss';

export interface MovieListToolbarProps {
  title: string;
  sortBy: string;
  selectedGenreIds: number[];
  dateRange: { gte?: string; lte?: string };
  isRevivalFilter: boolean | undefined;
  onSortChange: (value: string) => void;
  onFilterModalOpen: () => void;
}

export const MovieListToolbar = memo<MovieListToolbarProps>(
  function MovieListToolbar({
    title,
    sortBy,
    selectedGenreIds,
    dateRange,
    isRevivalFilter,
    onSortChange,
    onFilterModalOpen,
  }) {
    const hasActiveFilters =
      selectedGenreIds.length > 0 ||
      dateRange.gte ||
      dateRange.lte ||
      isRevivalFilter !== undefined;

    return (
      <div className={styles.c_movie_list__toolbar}>
        <h2 className={styles.c_movie_list__title}>{title}</h2>
        <div className={styles.c_movie_list__controls}>
          <Button
            variant='ghost'
            size='sm'
            onClick={onFilterModalOpen}
            aria-label='フィルター'
            className={styles.c_movie_list__filter_button}
          >
            <span className={styles.c_movie_list__filter_inner}>
              <FilterIcon />
              {hasActiveFilters && (
                <span className={styles.c_movie_list__filter_count} />
              )}
            </span>
          </Button>
          <Select
            options={SORT_OPTIONS}
            value={sortBy}
            onValueChange={onSortChange}
            aria-label='ソート順を選択'
            className={styles.c_movie_list__sort}
          />
        </div>
      </div>
    );
  },
);

MovieListToolbar.displayName = 'MovieListToolbar';
