/**
 * TanStack Query テスト用ヘルパー
 */

import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

/**
 * テスト用QueryClientを作成
 *
 * リトライ無効・gcTime短縮でテストの安定性を確保
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/**
 * テスト用QueryClientProviderラッパーを作成
 *
 * renderHookのwrapperオプションに渡して使用
 *
 * @example
 * const { result } = renderHook(() => useMovieList(options), {
 *   wrapper: createQueryWrapper(),
 * });
 */
export function createQueryWrapper(queryClient?: QueryClient) {
  const client = queryClient ?? createTestQueryClient();

  return function QueryWrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client, children });
  };
}
