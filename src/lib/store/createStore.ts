/**
 * devtools付きZustandストア作成関数
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { StateCreator } from 'zustand';

/**
 * devtoolsミドルウェアを自動適用するストア作成関数
 *
 * - 開発環境のみRedux DevToolsと連携
 * - 本番環境ではdevtoolsを無効化
 *
 * @param name - ストア名（DevToolsに表示される）
 * @param initializer - ストアの初期化関数
 * @returns Zustandストア
 *
 * @example
 * ```ts
 * interface CounterState {
 *   count: number;
 *   increment: () => void;
 * }
 *
 * const useCounterStore = createStore<CounterState>('counter', (set) => ({
 *   count: 0,
 *   increment: () => set((state) => ({ count: state.count + 1 })),
 * }));
 * ```
 */
export function createStore<T>(
  name: string,
  initializer: StateCreator<T, [['zustand/devtools', never]]>,
) {
  return create<T>()(
    devtools(initializer, {
      name,
      enabled: process.env.NODE_ENV !== 'production',
    }),
  );
}
