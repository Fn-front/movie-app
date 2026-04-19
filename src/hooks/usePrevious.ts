/**
 * usePrevious - 前回の値を保持するフック
 */

import { useEffect, useRef } from 'react';

/**
 * 前回のレンダリング時の値を保持する
 *
 * @param value - 保持する値
 * @returns 前回の値（初回はundefined）
 *
 * @example
 * ```tsx
 * const Counter = () => {
 *   const [count, setCount] = useState(0);
 *   const previousCount = usePrevious(count);
 *
 *   return (
 *     <div>
 *       <p>現在: {count}</p>
 *       <p>前回: {previousCount ?? 'なし'}</p>
 *       <button onClick={() => setCount(count + 1)}>増加</button>
 *     </div>
 *   );
 * };
 * ```
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  // eslint-disable-next-line react-hooks/refs
  return ref.current;
}
