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
});
