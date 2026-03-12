/**
 * MovieFilterコンポーネント
 * 検索結果ページ用フィルター（ジャンル・年代・評価）
 */

'use client';

import { memo, useCallback, useMemo } from 'react';

import { Checkbox } from '@/components/ui/checkbox/checkbox';
import { Select } from '@/components/ui/select/select';
import { Button } from '@/components/ui/button/button';
import type { Genre } from '@/lib/types';
import type { FilterOptions } from '@/features/search/hooks/useMovieFilter';

import styles from './movieFilter.module.scss';

/**
 * MovieFilterコンポーネントのプロパティ
 */
export interface MovieFilterProps {
  /** 現在のフィルター状態 */
  currentFilters: FilterOptions;
  /** フィルター変更ハンドラー */
  onFilterChange: (filters: FilterOptions) => void;
  /** フィルタークリアハンドラー */
  onFilterClear: () => void;
  /** フィルターが適用されているか */
  hasActiveFilters: boolean;
  /** ジャンル一覧 */
  genres: Genre[];
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_START = 2020;
const YEAR_END = CURRENT_YEAR + 5;

/**
 * 年代選択肢を生成
 */
function generateYearOptions() {
  const options = [];
  for (let year = YEAR_END; year >= YEAR_START; year--) {
    options.push({ label: `${year}年`, value: String(year) });
  }
  return options;
}

/**
 * 評価選択肢を生成（0〜10、0.5刻み）
 */
function generateRatingOptions() {
  const options = [];
  for (let rating = 10; rating >= 0; rating -= 0.5) {
    options.push({
      label: `${rating.toFixed(1)} 以上`,
      value: String(rating),
    });
  }
  return options;
}

const YEAR_OPTIONS = generateYearOptions();
const RATING_OPTIONS = generateRatingOptions();

/**
 * MovieFilterコンポーネント
 */
export const MovieFilter = memo<MovieFilterProps>(function MovieFilter({
  currentFilters,
  onFilterChange,
  onFilterClear,
  hasActiveFilters,
  genres,
}) {
  const selectedGenres = useMemo(
    () => new Set(currentFilters.genre ?? []),
    [currentFilters.genre],
  );

  const genreToggleHandlers = useMemo(
    () =>
      new Map(
        genres.map((genre) => [
          genre.id,
          (checked: boolean) => {
            const newGenres = new Set(selectedGenres);
            if (checked) {
              newGenres.add(genre.id);
            } else {
              newGenres.delete(genre.id);
            }
            onFilterChange({
              ...currentFilters,
              genre: newGenres.size > 0 ? Array.from(newGenres) : undefined,
            });
          },
        ]),
      ),
    [genres, selectedGenres, currentFilters, onFilterChange],
  );

  const handleYearChange = useCallback(
    (value: string) => {
      onFilterChange({
        ...currentFilters,
        year: Number(value),
      });
    },
    [currentFilters, onFilterChange],
  );

  const handleRatingChange = useCallback(
    (value: string) => {
      onFilterChange({
        ...currentFilters,
        vote_average_gte: Number(value),
      });
    },
    [currentFilters, onFilterChange],
  );

  return (
    <div
      className={styles.c_movie_filter}
      role='search'
      aria-label='映画フィルター'
    >
      <div className={styles.c_movie_filter__header}>
        <h2 className={styles.c_movie_filter__title}>フィルター</h2>
        {hasActiveFilters && (
          <Button
            variant='ghost'
            size='sm'
            onClick={onFilterClear}
            aria-label='フィルターをクリア'
          >
            クリア
          </Button>
        )}
      </div>

      <div className={styles.c_movie_filter__section}>
        <h3 className={styles.c_movie_filter__section_title}>ジャンル</h3>
        <div
          className={styles.c_movie_filter__genre_list}
          role='group'
          aria-label='ジャンル選択'
        >
          {genres.map((genre) => (
            <Checkbox
              key={genre.id}
              label={genre.name}
              checked={selectedGenres.has(genre.id)}
              onCheckedChange={genreToggleHandlers.get(genre.id)}
              className={styles.c_movie_filter__genre_item}
            />
          ))}
        </div>
      </div>

      <div className={styles.c_movie_filter__section}>
        <Select
          label='公開年'
          options={YEAR_OPTIONS}
          value={
            currentFilters.year !== undefined
              ? String(currentFilters.year)
              : undefined
          }
          onValueChange={handleYearChange}
          placeholder='すべての年代'
          aria-label='公開年を選択'
          fullWidth
        />
      </div>

      <div className={styles.c_movie_filter__section}>
        <Select
          label='最低評価'
          options={RATING_OPTIONS}
          value={
            currentFilters.vote_average_gte !== undefined
              ? String(currentFilters.vote_average_gte)
              : undefined
          }
          onValueChange={handleRatingChange}
          placeholder='すべての評価'
          aria-label='最低評価を選択'
          fullWidth
        />
      </div>
    </div>
  );
});

MovieFilter.displayName = 'MovieFilter';
