/**
 * MovieGridContainerコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';

import { MovieGridContainer } from './movieGridContainer';

jest.mock('@/components/ui/movie/movieTileSkeleton/movieTileSkeleton', () => ({
  MovieTileSkeleton: ({ count }: { count?: number }) => (
    <div data-testid='skeleton' data-count={count} />
  ),
}));

jest.mock('@/components/ui/loading/loading', () => ({
  Loading: ({ label }: { label: string }) => (
    <div data-testid='loading'>{label}</div>
  ),
}));

jest.mock('@/hooks/useIntersectionObserver', () => ({
  useIntersectionObserver: () => jest.fn(),
}));

describe('MovieGridContainer', () => {
  it('ローディング中はスケルトンを表示する', () => {
    render(
      <MovieGridContainer isLoading isEmpty={false}>
        <div>content</div>
      </MovieGridContainer>,
    );

    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('スケルトン数を指定できる', () => {
    render(
      <MovieGridContainer isLoading isEmpty={false} skeletonCount={8}>
        <div>content</div>
      </MovieGridContainer>,
    );

    expect(screen.getByTestId('skeleton')).toHaveAttribute('data-count', '8');
  });

  it('空状態のメッセージを表示する', () => {
    render(
      <MovieGridContainer
        isLoading={false}
        isEmpty
        emptyMessage='映画がありません'
      >
        <div>content</div>
      </MovieGridContainer>,
    );

    expect(screen.getByText('映画がありません')).toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('デフォルトの空メッセージを表示する', () => {
    render(
      <MovieGridContainer isLoading={false} isEmpty>
        <div>content</div>
      </MovieGridContainer>,
    );

    expect(screen.getByText('表示する映画がありません。')).toBeInTheDocument();
  });

  it('子要素をグリッド内に表示する', () => {
    render(
      <MovieGridContainer isLoading={false} isEmpty={false}>
        <div>Movie 1</div>
        <div>Movie 2</div>
      </MovieGridContainer>,
    );

    expect(screen.getByText('Movie 1')).toBeInTheDocument();
    expect(screen.getByText('Movie 2')).toBeInTheDocument();
  });

  it('次ページ取得中にローディングインジケーターを表示する', () => {
    render(
      <MovieGridContainer
        isLoading={false}
        isEmpty={false}
        isFetchingNextPage
        hasNextPage
        fetchNextPage={jest.fn()}
      >
        <div>content</div>
      </MovieGridContainer>,
    );

    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('fetchNextPageが未指定の場合はsentinelを表示しない', () => {
    const { container } = render(
      <MovieGridContainer isLoading={false} isEmpty={false}>
        <div>content</div>
      </MovieGridContainer>,
    );

    expect(
      container.querySelector('[class*="sentinel"]'),
    ).not.toBeInTheDocument();
  });

  it('fetchNextPageが指定されている場合はsentinelを表示する', () => {
    const { container } = render(
      <MovieGridContainer
        isLoading={false}
        isEmpty={false}
        fetchNextPage={jest.fn()}
      >
        <div>content</div>
      </MovieGridContainer>,
    );

    expect(container.querySelector('[class*="sentinel"]')).toBeInTheDocument();
  });
});
