/**
 * TanStack Query QueryClientProviderラッパー
 */

'use client';

import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';

import { HTTP_STATUS } from '@/constants';

/**
 * リトライしてよい失敗か判定する
 *
 * 4xx は再送しても結果が変わらない。とくに **429 を再送すると、制限に
 * 当たった利用者が自分でカウンタをさらに消費する**（#964）。
 * ネットワーク断やサーバー側の一時障害（5xx・レスポンス無し）だけ1回retryする。
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    // レスポンス自体が無い＝ネットワーク断。これはretryする価値がある
    if (status === undefined) return true;
    if (status >= HTTP_STATUS.BAD_REQUEST && status < 500) return false;
  }

  return true;
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

interface AppQueryProviderProps {
  children: ReactNode;
}

export function AppQueryProvider({ children }: AppQueryProviderProps) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
