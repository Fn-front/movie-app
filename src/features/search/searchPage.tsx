/**
 * SearchPageコンポーネント
 * 検索結果ページのメインコンポーネント
 */

'use client';

import { memo, useCallback, useState } from 'react';
import { IoFilterOutline } from 'react-icons/io5';

import { SearchResults } from '@/features/search/component/searchResults/searchResults';
import { MovieFilter } from '@/features/search/component/movieFilter/movieFilter';
import { useSearch } from '@/features/search/hooks/useSearch';
import { useMovieFilter } from '@/features/search/hooks/useMovieFilter';
import { useGenres } from '@/features/search/hooks/useGenres';
import { Button } from '@/components/ui/button/button';

import styles from './searchPage.module.scss';

/**
 * SearchPageコンポーネント
 */
export const SearchPage = memo(function SearchPage() {
  const {
    query,
    movies,
    totalResults,
    currentPage,
    totalPages,
    isLoading,
    handlePageChange,
    suggestions,
    isSuggestionLoading,
  } = useSearch();

  const {
    currentFilters,
    hasActiveFilters,
    handleFilterChange,
    handleFilterClear,
  } = useMovieFilter();

  const { genres } = useGenres();

  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const handleFilterToggle = useCallback(() => {
    setIsFilterOpen((prev) => !prev);
  }, []);

  return (
    <div className={styles.c_search_page}>
      <div className={styles.c_search_page__header}>
        <h1 className={styles.c_search_page__title}>
          {query ? `「${query}」の検索結果` : '検索結果'}
        </h1>
        <Button
          variant='secondary'
          size='sm'
          onClick={handleFilterToggle}
          className={styles.c_search_page__filter_toggle}
          aria-expanded={isFilterOpen}
          aria-controls='search-filter'
        >
          <IoFilterOutline />
          フィルター
        </Button>
      </div>

      <div className={styles.c_search_page__content}>
        <aside
          id='search-filter'
          className={`${styles.c_search_page__filter} ${isFilterOpen ? styles['c_search_page__filter--open'] : ''}`}
        >
          <MovieFilter
            currentFilters={currentFilters}
            onFilterChange={handleFilterChange}
            onFilterClear={handleFilterClear}
            hasActiveFilters={hasActiveFilters}
            genres={genres}
          />
        </aside>

        <div className={styles.c_search_page__results}>
          <SearchResults
            movies={movies}
            totalResults={totalResults}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            isLoading={isLoading}
            suggestions={suggestions}
            isSuggestionLoading={isSuggestionLoading}
          />
        </div>
      </div>
    </div>
  );
});

SearchPage.displayName = 'SearchPage';
