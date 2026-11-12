import { render, screen } from '@testing-library/react';

import { HomePage } from './home';

// --- Mocks ---

jest.mock('@/components/layout/appLayout/appLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='app-layout'>{children}</div>
  ),
}));

jest.mock(
  '@/features/nowShowing/component/nowShowingMovieList/nowShowingMovieList',
  () => ({
    NowShowingMovieList: () => (
      <div data-testid='now-showing-movie-list'>劇場公開中の人気映画</div>
    ),
  }),
);

jest.mock(
  '@/features/recommendations/component/recommendationSection/recommendationSection',
  () => ({
    RecommendationSection: () => (
      <div data-testid='recommendation-section'>おすすめ映画</div>
    ),
  }),
);

jest.mock(
  '@/features/home/component/homeMovieDetailModal/homeMovieDetailModal',
  () => ({
    HomeMovieDetailModal: () => (
      <div data-testid='home-movie-detail-modal'>映画詳細モーダル</div>
    ),
  }),
);

// --- Tests ---

describe('HomePage', () => {
  it('AppLayout内にNowShowingMovieListが表示される', () => {
    render(
      <HomePage
        nowShowingMovies={[]}
        recommendations={[]}
        hasFavorites={false}
        isAuthenticated={true}
      />,
    );

    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    expect(screen.getByTestId('now-showing-movie-list')).toBeInTheDocument();
  });

  it('NowShowingMovieListがAppLayoutの子要素である', () => {
    render(
      <HomePage
        nowShowingMovies={[]}
        recommendations={[]}
        hasFavorites={false}
        isAuthenticated={true}
      />,
    );

    const appLayout = screen.getByTestId('app-layout');
    const nowShowingList = screen.getByTestId('now-showing-movie-list');
    expect(appLayout).toContainElement(nowShowingList);
  });

  it('認証済みの場合RecommendationSectionが表示される', () => {
    render(
      <HomePage
        nowShowingMovies={[]}
        recommendations={[]}
        hasFavorites={false}
        isAuthenticated={true}
      />,
    );

    expect(screen.getByTestId('recommendation-section')).toBeInTheDocument();
  });

  it('未認証の場合RecommendationSectionが表示されない', () => {
    render(
      <HomePage
        nowShowingMovies={[]}
        recommendations={[]}
        hasFavorites={false}
        isAuthenticated={false}
      />,
    );

    expect(
      screen.queryByTestId('recommendation-section'),
    ).not.toBeInTheDocument();
  });

  /**
   * 詳細モーダルはホームに1つだけ
   *
   * 以前は `NowShowingMovieList` と `RecommendationSection` が**両方**
   * モーダルを描いていた。どちらも URL の `movie_id` を読むため、
   * タイルを押すと2枚同時に開いていた（E2E が
   * `getByRole('dialog') resolved to 2 elements` で落ちた）。
   * セクション側に戻すとこのテストが落ちる。
   */
  it('詳細モーダルは認証状態にかかわらず1つだけ描かれる', () => {
    const { rerender } = render(
      <HomePage
        nowShowingMovies={[]}
        recommendations={[]}
        hasFavorites={false}
        isAuthenticated={true}
      />,
    );

    expect(screen.getAllByTestId('home-movie-detail-modal')).toHaveLength(1);

    rerender(
      <HomePage
        nowShowingMovies={[]}
        recommendations={[]}
        hasFavorites={false}
        isAuthenticated={false}
      />,
    );

    expect(screen.getAllByTestId('home-movie-detail-modal')).toHaveLength(1);
  });
});
