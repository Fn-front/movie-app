/**
 * SearchPageコンポーネント
 * 検索結果ページのメインコンポーネント
 */

'use client';

import { memo } from 'react';

import { SearchResults } from '@/features/search/component/searchResults/searchResults';
import { useSearch } from '@/features/search/hooks/useSearch';

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
  } = useSearch();

  return (
    <div className={styles.c_search_page}>
      <h1 className={styles.c_search_page__title}>
        {query ? `「${query}」の検索結果` : '検索結果'}
      </h1>

      <SearchResults
        movies={movies}
        totalResults={totalResults}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        isLoading={isLoading}
      />
    </div>
  );
});

SearchPage.displayName = 'SearchPage';
