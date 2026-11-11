/**
 * MovieGridContainerコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';

import { MovieGridContainer } from './movieGridContainer';

jest.mock('@/components/ui/movie/movieTileSkeleton/movieTileSkeleton', () => ({
  MovieTileSkeleton: ({
    count,
    viewMode,
  }: {
    count?: number;
    viewMode?: string;
  }) => (
    <div data-testid='skeleton' data-count={count} data-view-mode={viewMode} />
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

  // リスト表示（#1014）
  describe('表示モード', () => {
    it('既定ではグリッドのクラスを使う', () => {
      const { container } = render(
        <MovieGridContainer isLoading={false} isEmpty={false}>
          <div>content</div>
        </MovieGridContainer>,
      );

      expect(
        container.querySelector('.c_movie_grid_container__grid'),
      ).toBeInTheDocument();
      expect(
        container.querySelector('.c_movie_grid_container__list'),
      ).not.toBeInTheDocument();
    });

    it('viewMode="list" ではリストのクラスを使う', () => {
      const { container } = render(
        <MovieGridContainer isLoading={false} isEmpty={false} viewMode='list'>
          <div>content</div>
        </MovieGridContainer>,
      );

      expect(
        container.querySelector('.c_movie_grid_container__list'),
      ).toBeInTheDocument();
      expect(
        container.querySelector('.c_movie_grid_container__grid'),
      ).not.toBeInTheDocument();
    });

    // 読み込み中だけグリッドに戻ると、切替直後にレイアウトが二度変わる
    it('viewMode="list" のスケルトンもリストのクラスを使う', () => {
      const { container } = render(
        <MovieGridContainer isLoading isEmpty={false} viewMode='list' />,
      );

      expect(
        container.querySelector('.c_movie_grid_container__list'),
      ).toBeInTheDocument();
    });

    // 並びだけリストにしてスケルトンを縦長のまま出すと、1件で画面が埋まる
    it('スケルトンにも同じ表示モードを渡す', () => {
      render(<MovieGridContainer isLoading isEmpty={false} viewMode='list' />);

      expect(screen.getByTestId('skeleton')).toHaveAttribute(
        'data-view-mode',
        'list',
      );
    });
  });
});
