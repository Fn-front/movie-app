/**
 * useClickOutside - 外側クリック検知フック
 */

'use client';

import { type RefObject, useCallback, useEffect } from 'react';

/**
 * 要素の外側をクリックした時にコールバックを実行する
 *
 * @param ref - 対象要素のRef
 * @param callback - 外側クリック時のコールバック
 *
 * @example
 * ```tsx
 * const Dropdown = () => {
 *   const [isOpen, setIsOpen] = useState(false);
 *   const dropdownRef = useRef<HTMLDivElement>(null);
 *
 *   useClickOutside(dropdownRef, () => {
 *     setIsOpen(false);
 *   });
 *
 *   return (
 *     <div ref={dropdownRef}>
 *       <button onClick={() => setIsOpen(!isOpen)}>
 *         メニュー
 *       </button>
 *       {isOpen && (
 *         <ul>
 *           <li>項目1</li>
 *           <li>項目2</li>
 *         </ul>
 *       )}
 *     </div>
 *   );
 * };
 * ```
 */
export function useClickOutside<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T | null>,
  callback: (event: MouseEvent | TouchEvent) => void,
): void {
  const handleClickOutside = useCallback(
    (event: MouseEvent | TouchEvent) => {
      // refが存在しない、またはクリックされた要素が内部にある場合は何もしない
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }

      callback(event);
    },
    [ref, callback],
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // イベントリスナーを追加
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    // クリーンアップ
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [handleClickOutside]);
}
