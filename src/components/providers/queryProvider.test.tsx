/**
 * AppQueryProviderのテスト
 */

import { render, screen } from '@testing-library/react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';

import { AppQueryProvider } from './queryProvider';

function TestChild() {
  const queryClient = useQueryClient();
  return (
    <div data-testid='test-child'>
      {queryClient ? 'QueryClient利用可能' : 'QueryClient無し'}
    </div>
  );
}

/** 取り出した QueryClient を外へ渡すためのコールバックを受け取る */
function Capture({ onReady }: { onReady: (client: QueryClient) => void }) {
  onReady(useQueryClient());
  return null;
}

/** プロバイダに実際に設定された retry 述語を取り出す */
function captureRetry(): (failureCount: number, error: unknown) => boolean {
  const clients: QueryClient[] = [];

  render(
    <AppQueryProvider>
      <Capture onReady={(client) => clients.push(client)} />
    </AppQueryProvider>,
  );

  const retry = clients[0]?.getDefaultOptions().queries?.retry;
  if (typeof retry !== 'function') {
    throw new Error('retry が述語関数ではない');
  }
  return retry as (failureCount: number, error: unknown) => boolean;
}

/** status を持つ AxiosError を作る（status 未指定ならレスポンス無し＝ネットワーク断） */
function axiosErrorWith(status?: number): AxiosError {
  const error = new AxiosError('failed');
  if (status !== undefined) {
    error.response = {
      status,
      statusText: '',
      data: null,
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() },
    };
  }
  return error;
}

describe('AppQueryProvider', () => {
  it('子コンポーネントにQueryClientを提供する', () => {
    render(
      <AppQueryProvider>
        <TestChild />
      </AppQueryProvider>,
    );

    expect(screen.getByTestId('test-child')).toHaveTextContent(
      'QueryClient利用可能',
    );
  });

  it('子コンポーネントを正しくレンダリングする', () => {
    render(
      <AppQueryProvider>
        <div data-testid='child'>テストコンテンツ</div>
      </AppQueryProvider>,
    );

    expect(screen.getByTestId('child')).toHaveTextContent('テストコンテンツ');
  });

  describe('リトライ方針（#964）', () => {
    it('429 はリトライしない', () => {
      // 再送すると、制限に当たった利用者が自分でカウンタをさらに消費する
      const retry = captureRetry();

      expect(retry(0, axiosErrorWith(429))).toBe(false);
    });

    it.each([400, 401, 403, 404, 422])(
      '%i はリトライしない（再送しても結果が変わらない）',
      (status) => {
        const retry = captureRetry();

        expect(retry(0, axiosErrorWith(status))).toBe(false);
      },
    );

    it.each([500, 502, 503])('%i は1回リトライする', (status) => {
      const retry = captureRetry();

      expect(retry(0, axiosErrorWith(status))).toBe(true);
    });

    it('レスポンスが無い場合（ネットワーク断）はリトライする', () => {
      const retry = captureRetry();

      expect(retry(0, axiosErrorWith())).toBe(true);
    });

    it('Axios 以外の例外もリトライする', () => {
      const retry = captureRetry();

      expect(retry(0, new Error('boom'))).toBe(true);
    });

    it('2回目以降はリトライしない', () => {
      const retry = captureRetry();

      expect(retry(1, axiosErrorWith(500))).toBe(false);
    });
  });
});
