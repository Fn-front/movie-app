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

/** 公開期間の説明文のID（`aria-describedby` から参照する） */
const DATE_RANGE_HINT_ID = 'search-filter-date-range-hint';

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

  // 年と期間は意味論が違うので混ぜない（APIも同時指定を400で弾く）。
  // 片方を触ったらもう片方を落とす（#997）
  const handleYearChange = useCallback(
    (value: string) => {
      onFilterChange({
        ...currentFilters,
        year: Number(value),
        release_date_gte: undefined,
        release_date_lte: undefined,
      });
    },
    [currentFilters, onFilterChange],
  );

  const handleDateGteChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFilterChange({
        ...currentFilters,
        year: undefined,
        release_date_gte: e.target.value || undefined,
      });
    },
    [currentFilters, onFilterChange],
  );

  const handleDateLteChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFilterChange({
        ...currentFilters,
        year: undefined,
        release_date_lte: e.target.value || undefined,
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

      {/*
        年より細かい期間での絞り込み（#997）。

        年指定（primary_release_year＝代表公開日の年）とは意味が違い、
        こちらは「いずれかの国のリリースが範囲に入るか」で絞るため、
        同じ「2026年」でも結果が一致しない。混ぜると説明できないので、
        どちらかを触るともう片方は解除される
      */}
      <div className={styles.c_movie_filter__section}>
        <h3 className={styles.c_movie_filter__section_title}>公開期間</h3>
        <p
          id={DATE_RANGE_HINT_ID}
          className={styles.c_movie_filter__section_hint}
        >
          公開年とは同時に指定できません。
        </p>
        <div className={styles.c_movie_filter__date_range}>
          <label className={styles.c_movie_filter__date_field}>
            <span className={styles.c_movie_filter__date_label}>開始日</span>
            <input
              type='date'
              value={currentFilters.release_date_gte ?? ''}
              onChange={handleDateGteChange}
              max={currentFilters.release_date_lte}
              aria-describedby={DATE_RANGE_HINT_ID}
              className={styles.c_movie_filter__date_input}
            />
          </label>
          <span className={styles.c_movie_filter__date_separator}>〜</span>
          <label className={styles.c_movie_filter__date_field}>
            <span className={styles.c_movie_filter__date_label}>終了日</span>
            <input
              type='date'
              value={currentFilters.release_date_lte ?? ''}
              onChange={handleDateLteChange}
              min={currentFilters.release_date_gte}
              aria-describedby={DATE_RANGE_HINT_ID}
              className={styles.c_movie_filter__date_input}
            />
          </label>
        </div>
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
