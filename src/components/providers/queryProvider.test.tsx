/**
 * AppQueryProviderのテスト
 */

import { render, screen } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';

import { AppQueryProvider } from './queryProvider';

function TestChild() {
  const queryClient = useQueryClient();
  return (
    <div data-testid='test-child'>
      {queryClient ? 'QueryClient利用可能' : 'QueryClient無し'}
    </div>
  );
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

  it('複数回マウントしても同じQueryClientインスタンスが使用される', () => {
    let firstClient: unknown;
    let secondClient: unknown;

    function CaptureClient({ onCapture }: { onCapture: (c: unknown) => void }) {
      const client = useQueryClient();
      onCapture(client);
      return null;
    }

    render(
      <AppQueryProvider>
        <CaptureClient onCapture={(c) => { firstClient = c; }} />
      </AppQueryProvider>,
    );

    render(
      <AppQueryProvider>
        <CaptureClient onCapture={(c) => { secondClient = c; }} />
      </AppQueryProvider>,
    );

    expect(firstClient).toBe(secondClient);
  });
});
