/**
 * useLocalStorage - ローカルストレージ管理フック
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * ローカルストレージの値を管理する
 *
 * @param key - ストレージキー
 * @param initialValue - 初期値
 * @returns [値, 値更新関数, 値削除関数]
 *
 * @example
 * ```tsx
 * const UserSettings = () => {
 *   const [theme, setTheme, removeTheme] = useLocalStorage('theme', 'light');
 *
 *   return (
 *     <div>
 *       <p>現在のテーマ: {theme}</p>
 *       <button onClick={() => setTheme('dark')}>ダークモード</button>
 *       <button onClick={() => setTheme('light')}>ライトモード</button>
 *       <button onClick={removeTheme}>リセット</button>
 *     </div>
 *   );
 * };
 * ```
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prevValue: T) => T)) => void, () => void] {
  // サーバーサイドレンダリング対応
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // 値を更新する関数
  const setValue = useCallback(
    (value: T | ((prevValue: T) => T)) => {
      try {
        // 関数の場合は前の値を渡して実行
        const valueToStore =
          value instanceof Function ? value(storedValue) : value;

        setStoredValue(valueToStore);

        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, storedValue],
  );

  // 値を削除する関数
  const removeValue = useCallback(() => {
    try {
      setStoredValue(initialValue);

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
      }
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  // 他のタブでの変更を検知
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue) as T);
        } catch (error) {
          console.error(`Error parsing storage event for key "${key}":`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [key]);

  return [storedValue, setValue, removeValue];
}
