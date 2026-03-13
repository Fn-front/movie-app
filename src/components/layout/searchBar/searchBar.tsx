/**
 * SearchBarコンポーネント
 * Header内に配置する検索バー
 */

'use client';

import {
  type ChangeEvent,
  type FormEvent,
  memo,
  useCallback,
  useState,
  useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import { IoSearchOutline } from 'react-icons/io5';

import { Loading } from '@/components/ui/loading/loading';

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
    },
    [query, router],
  );

  const classNames = [styles.c_search_bar, className].filter(Boolean).join(' ');

  return (
    <form className={classNames} role='search' onSubmit={handleSubmit}>
      <input
        type='text'
        className={styles.c_search_bar__input}
        value={query}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label='映画を検索'
      />
      <button
        type='submit'
        className={styles.c_search_bar__button}
        aria-label='検索'
        disabled={!query.trim() || isPending}
      >
        {isPending ? (
          <Loading size='sm' aria-label='検索中' />
        ) : (
          <IoSearchOutline size={20} aria-hidden='true' />
        )}
      </button>
    </form>
  );
});

SearchBar.displayName = 'SearchBar';
