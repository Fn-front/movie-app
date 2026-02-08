/**
 * devtools + persist付きZustandストア作成関数
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import type { StateCreator } from 'zustand';

/**
 * persist用オプション
 */
interface PersistStoreOptions<T> {
  /** 永続化する状態を部分的に選択する関数 */
  partialize?: (state: T) => Partial<T>;
}

/**
 * devtools + persistミドルウェアを自動適用するストア作成関数
 *
 * - ローカルストレージに状態を永続化
 * - 開発環境のみRedux DevToolsと連携
 * - `store.persist.clearStorage()` で永続化データを破棄可能
 *
 * @param name - ストア名（DevToolsとストレージキーに使用）
 * @param initializer - ストアの初期化関数
 * @param options - persist用オプション
 * @returns Zustandストア（persist API付き）
 *
 * @example
 * ```ts
 * interface SettingsState {
 *   theme: 'light' | 'dark';
 *   setTheme: (theme: 'light' | 'dark') => void;
 * }
 *
 * const useSettingsStore = createPersistStore<SettingsState>(
 *   'settings',
 *   (set) => ({
 *     theme: 'light',
 *     setTheme: (theme) => set({ theme }),
 *   }),
 *   {
 *     partialize: (state) => ({ theme: state.theme }),
 *   },
 * );
 *
 * // 永続化データを破棄
 * useSettingsStore.persist.clearStorage();
 * ```
 */
export function createPersistStore<T>(
  name: string,
  initializer: StateCreator<
    T,
    [['zustand/devtools', never], ['zustand/persist', unknown]]
  >,
  options?: PersistStoreOptions<T>,
) {
  return create<T>()(
    devtools(
      persist(initializer, {
        name,
        storage: createJSONStorage(() => localStorage),
        ...(options?.partialize ? { partialize: options.partialize } : {}),
      }),
      {
        name,
        enabled: process.env.NODE_ENV !== 'production',
      },
    ),
  );
}
