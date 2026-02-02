/**
 * useToggle - boolean状態管理フック
 */

import { useCallback, useState } from 'react';

/**
 * boolean値のトグル状態を管理する
 *
 * @param initialValue - 初期値（デフォルト: false）
 * @returns [現在の値, トグル関数, true設定関数, false設定関数]
 *
 * @example
 * ```tsx
 * const Modal = () => {
 *   const [isOpen, toggle, setTrue, setFalse] = useToggle(false);
 *
 *   return (
 *     <div>
 *       <button onClick={toggle}>トグル</button>
 *       <button onClick={setTrue}>開く</button>
 *       <button onClick={setFalse}>閉じる</button>
 *       {isOpen && <div>モーダルコンテンツ</div>}
 *     </div>
 *   );
 * };
 * ```
 */
export function useToggle(
  initialValue: boolean = false,
): [boolean, () => void, () => void, () => void] {
  const [value, setValue] = useState<boolean>(initialValue);

  // トグル関数
  const toggle = useCallback(() => {
    setValue((prev) => !prev);
  }, []);

  // true設定関数
  const setTrue = useCallback(() => {
    setValue(true);
  }, []);

  // false設定関数
  const setFalse = useCallback(() => {
    setValue(false);
  }, []);

  return [value, toggle, setTrue, setFalse];
}
