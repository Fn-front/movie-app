/**
 * useDebounce - 入力遅延処理フック
 */

import { useEffect, useState } from 'react';

/**
 * 値の更新を指定ミリ秒遅延させる
 *
 * @param value - 遅延させる値
 * @param delay - 遅延時間（ミリ秒）
 * @returns 遅延された値
 *
 * @example
 * ```tsx
 * const SearchInput = () => {
 *   const [searchTerm, setSearchTerm] = useState('');
 *   const debouncedSearchTerm = useDebounce(searchTerm, 500);
 *
 *   useEffect(() => {
 *     if (debouncedSearchTerm) {
 *       // API呼び出し
 *       fetchSearchResults(debouncedSearchTerm);
 *     }
 *   }, [debouncedSearchTerm]);
 *
 *   return (
 *     <input
 *       value={searchTerm}
 *       onChange={(e) => setSearchTerm(e.target.value)}
 *     />
 *   );
 * };
 * ```
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // 指定時間後に値を更新
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // クリーンアップ: 次の値が来たらタイマーをキャンセル
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
