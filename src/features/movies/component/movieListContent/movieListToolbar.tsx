/**
 * MovieListToolbarコンポーネント
 * ツールバー部分（タイトル・フィルターボタン・ソート選択）
 */

'use client';

import { memo } from 'react';

import { Button } from '@/components/ui/button/button';
import { Select } from '@/components/ui/select/select';
import { FilterIcon } from '@/components/icons/filterIcon/filterIcon';
import { ViewModeToggle } from '@/components/ui/movie/viewModeToggle/viewModeToggle';
import { FILTER_LABELS, SORT_OPTIONS } from '@/constants';

import styles from './movieListContent.module.scss';

/**
 * 「絞り込み中」を支援技術へ伝える要素のID
 *
 * ツールバーは1ページに1つなので固定で足りる。
 */
const FILTER_ACTIVE_DESCRIPTION_ID = 'movie-list-filter-active';

export interface MovieListToolbarProps {
  title: string;
  sortBy: string;
  /**
   * 絞り込みが掛かっているか
   *
   * ⚠️ **ここで条件を並べ直さないこと。** 以前はこのコンポーネントが
   * `selectedGenreIds` / `dateRange` / `isRevivalFilter` を受け取って
   * 自前で判定しており、配信プロバイダー・提供形態・地域の3つが
   * 漏れていた（#1063）。判定は `useMovieList` が
   * `buildFilterConditions` から導出する。
   */
  hasActiveFilters: boolean;
  onSortChange: (value: string) => void;
  onFilterModalOpen: () => void;
}

export const MovieListToolbar = memo<MovieListToolbarProps>(
  function MovieListToolbar({
    title,
    sortBy,
    hasActiveFilters,
    onSortChange,
    onFilterModalOpen,
  }) {
    return (
      <div className={styles.c_movie_list__toolbar}>
        <h1 className={styles.c_movie_list__title}>{title}</h1>
        <div className={styles.c_movie_list__controls}>
          <ViewModeToggle />
          {/*
            ⚠️ `aria-label` は**状態で出し分けない**（#1046 の方針）。
            名前は「フィルター」で固定し、絞り込み中かどうかは
            `aria-describedby` の説明として別に伝える。
            読み上げは「フィルター、ボタン、絞り込み中」になる。

            ⚠️ 印の span に `aria-label` を付ける案は効かない。
            ボタンが `aria-label` を持つと中身は名前の計算に使われず、
            支援技術もボタンの子を個別には読まないため、**何も伝わらない**。
            実測（Chrome の AX ツリー）でも、その形ではボタンの
            `description` が `null` のままだった。

            ⚠️ 「role の無い span への `aria-label` は `aria-prohibited-attr`
            に当たるから」ではない。**ボタンの子なら当たらない**（axe 4.14 で
            pass を実測）。当たるのはボタンの外に単独で置いた場合。
            ここで効かない理由は上の1点だけ。
          */}
          <Button
            variant='ghost'
            size='sm'
            onClick={onFilterModalOpen}
            aria-label='フィルター'
            aria-describedby={
              hasActiveFilters ? FILTER_ACTIVE_DESCRIPTION_ID : undefined
            }
            className={styles.c_movie_list__filter_button}
          >
            <span className={styles.c_movie_list__filter_inner}>
              <FilterIcon />
              {hasActiveFilters && (
                <>
                  {/* 青いドット。意味は下の説明が持つので読み上げから外す */}
                  <span
                    className={styles.c_movie_list__filter_count}
                    aria-hidden='true'
                  />
                  <span id={FILTER_ACTIVE_DESCRIPTION_ID} className='sr-only'>
                    {FILTER_LABELS.FILTER_ACTIVE}
                  </span>
                </>
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
