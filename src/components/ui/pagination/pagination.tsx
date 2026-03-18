/**
 * Paginationコンポーネント
 */

'use client';

import { type HTMLAttributes, memo, useCallback, useMemo } from 'react';

import { ARIA_LABELS } from '@/constants';
import { cn } from '@/utils/cn';

import styles from './pagination.module.scss';

/**
 * Paginationコンポーネントのプロパティ
 */
export interface PaginationProps extends HTMLAttributes<HTMLDivElement> {
  /** 現在のページ（1始まり） */
  currentPage: number;
  /** 総ページ数 */
  totalPages: number;
  /** ページ変更時のコールバック */
  onPageChange: (page: number) => void;
  /** 表示するページ番号の最大数 */
  maxPageButtons?: number;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * Paginationコンポーネント
 *
 * @example
 * ```tsx
 * <Pagination
 *   currentPage={currentPage}
 *   totalPages={totalPages}
 *   onPageChange={setCurrentPage}
 * />
 * ```
 */
export const Pagination = memo<PaginationProps>(function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  maxPageButtons = 7,
  className,
  ...props
}) {
  const handlePageChange = useCallback(
    (page: number) => {
      if (page >= 1 && page <= totalPages && page !== currentPage) {
        onPageChange(page);
      }
    },
    [currentPage, totalPages, onPageChange],
  );

  const handleFirst = useCallback(() => {
    handlePageChange(1);
  }, [handlePageChange]);

  const handlePrevious = useCallback(() => {
    handlePageChange(currentPage - 1);
  }, [currentPage, handlePageChange]);

  const handleNext = useCallback(() => {
    handlePageChange(currentPage + 1);
  }, [currentPage, handlePageChange]);

  const handleLast = useCallback(() => {
    handlePageChange(totalPages);
  }, [totalPages, handlePageChange]);

  // ページ番号の配列を生成（中略表示対応）
  const pageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis')[] = [];

    if (totalPages <= maxPageButtons) {
      // 総ページ数が少ない場合は全て表示
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // 多い場合は中略表示
      const leftSiblingIndex = Math.max(currentPage - 1, 1);
      const rightSiblingIndex = Math.min(currentPage + 1, totalPages);

      const showLeftEllipsis = leftSiblingIndex > 2;
      const showRightEllipsis = rightSiblingIndex < totalPages - 1;

      // 最初のページ
      pages.push(1);

      // 左側の中略
      if (showLeftEllipsis) {
        pages.push('ellipsis');
      }

      // 中央のページ番号
      for (let i = leftSiblingIndex; i <= rightSiblingIndex; i++) {
        if (i !== 1 && i !== totalPages) {
          pages.push(i);
        }
      }

      // 右側の中略
      if (showRightEllipsis) {
        pages.push('ellipsis');
      }

      // 最後のページ
      if (totalPages > 1) {
        pages.push(totalPages);
      }
    }

    return pages;
  }, [currentPage, totalPages, maxPageButtons]);

  const wrapperClassNames = cn(styles.c_pagination, className);

  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      className={wrapperClassNames}
      aria-label={ARIA_LABELS.PAGINATION}
      {...props}
    >
      <button
        type='button'
        className={styles.c_pagination__button}
        onClick={handleFirst}
        disabled={currentPage === 1}
        aria-label={ARIA_LABELS.FIRST_PAGE}
      >
        <svg
          width='20'
          height='20'
          viewBox='0 0 20 20'
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
          aria-hidden='true'
        >
          <path
            d='M15 15L10 10L15 5'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
          <path
            d='M7 5L7 15'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
          />
        </svg>
      </button>

      <button
        type='button'
        className={styles.c_pagination__button}
        onClick={handlePrevious}
        disabled={currentPage === 1}
        aria-label={ARIA_LABELS.PREV_PAGE}
      >
        <svg
          width='20'
          height='20'
          viewBox='0 0 20 20'
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
          aria-hidden='true'
        >
          <path
            d='M12.5 15L7.5 10L12.5 5'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </svg>
      </button>

      <div className={styles.c_pagination__pages}>
        {pageNumbers.map((page, index) =>
          page === 'ellipsis' ? (
            <span
              key={`ellipsis-${pageNumbers[index - 1]}`}
              className={styles.c_pagination__ellipsis}
              aria-hidden='true'
            >
              ...
            </span>
          ) : (
            <button
              key={page}
              type='button'
              className={`${styles.c_pagination__page} ${
                page === currentPage ? styles.c_pagination__page__active : ''
              }`}
              onClick={() => handlePageChange(page)}
              aria-label={ARIA_LABELS.PAGE(page)}
              aria-current={page === currentPage ? 'page' : undefined}
            >
              {page}
            </button>
          ),
        )}
      </div>

      <button
        type='button'
        className={styles.c_pagination__button}
        onClick={handleNext}
        disabled={currentPage === totalPages}
        aria-label={ARIA_LABELS.NEXT_PAGE}
      >
        <svg
          width='20'
          height='20'
          viewBox='0 0 20 20'
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
          aria-hidden='true'
        >
          <path
            d='M7.5 15L12.5 10L7.5 5'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </svg>
      </button>

      <button
        type='button'
        className={styles.c_pagination__button}
        onClick={handleLast}
        disabled={currentPage === totalPages}
        aria-label={ARIA_LABELS.LAST_PAGE}
      >
        <svg
          width='20'
          height='20'
          viewBox='0 0 20 20'
          fill='none'
          xmlns='http://www.w3.org/2000/svg'
          aria-hidden='true'
        >
          <path
            d='M5 15L10 10L5 5'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
          <path
            d='M13 5L13 15'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
          />
        </svg>
      </button>
    </nav>
  );
});

Pagination.displayName = 'Pagination';
