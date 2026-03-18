/**
 * SearchBarコンポーネント
 * Header内に配置する検索バー
 * SP時は検索アイコンタップで展開する
 */

'use client';

import {
  type ChangeEvent,
  type FormEvent,
  memo,
  useCallback,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import { IoSearchOutline, IoCloseOutline } from 'react-icons/io5';

import { Loading } from '@/components/ui/loading/loading';
import { ICON_SIZES, ARIA_LABELS } from '@/constants';
import { cn } from '@/utils/cn';

import styles from './searchBar.module.scss';

/**
 * SearchBarコンポーネントのプロパティ
 */
export interface SearchBarProps {
  /** 初期値（URLクエリから） */
  defaultValue?: string;
  /** プレースホルダー */
  placeholder?: string;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * SearchBarコンポーネント
 *
 * @example
 * ```tsx
 * <SearchBar defaultValue="" placeholder="映画を検索..." />
 * ```
 */
export const SearchBar = memo<SearchBarProps>(function SearchBar({
  defaultValue = '',
  placeholder = '映画を検索...',
  className,
}) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);
  const [isPending, startTransition] = useTransition();
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed) return;
      startTransition(() => {
        router.push(`/search?query=${encodeURIComponent(trimmed)}`);
      });
      setIsExpanded(false);
    },
    [query, router],
  );

  const handleExpand = useCallback(() => {
    setIsExpanded(true);
    // 展開後にinputにフォーカス
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  const handleCollapse = useCallback(() => {
    setIsExpanded(false);
    setQuery('');
  }, []);

  const classNames = cn(styles.c_search_bar, className);

  const formClassNames = cn(
    styles.c_search_bar__form,
    isExpanded && styles['c_search_bar__form--expanded'],
  );

  return (
    <div className={classNames}>
      {/* SP: 検索アイコンボタン（展開トリガー） */}
      <button
        type='button'
        className={styles.c_search_bar__toggle}
        onClick={handleExpand}
        aria-label={ARIA_LABELS.OPEN_SEARCH}
      >
        <IoSearchOutline size={ICON_SIZES.SM} aria-hidden='true' />
      </button>

      {/* 検索フォーム（PC: 常に表示、SP: 展開時のみ表示） */}
      <form className={formClassNames} role='search' onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type='text'
          className={styles.c_search_bar__input}
          value={query}
          onChange={handleChange}
          placeholder={placeholder}
          aria-label={ARIA_LABELS.SEARCH_MOVIES}
        />
        <button
          type='submit'
          className={styles.c_search_bar__button}
          aria-label={ARIA_LABELS.SEARCH}
          disabled={!query.trim() || isPending}
        >
          <IoSearchOutline size={ICON_SIZES.SM} aria-hidden='true' />
        </button>
        {/* SP: 閉じるボタン */}
        <button
          type='button'
          className={styles.c_search_bar__close}
          onClick={handleCollapse}
          aria-label={ARIA_LABELS.CLOSE_SEARCH}
        >
          <IoCloseOutline size={ICON_SIZES.SM} aria-hidden='true' />
        </button>
      </form>

      {/* SP: 展開時のオーバーレイ */}
      {isExpanded && (
        <button
          type='button'
          className={styles.c_search_bar__overlay}
          onClick={handleCollapse}
          aria-label={ARIA_LABELS.CLOSE_SEARCH}
          tabIndex={-1}
        />
      )}

      {isPending && <Loading fullScreen label='検索中...' />}
    </div>
  );
});

SearchBar.displayName = 'SearchBar';
