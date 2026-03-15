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

// --- Tests ---

describe('HomePage', () => {
  it('AppLayout内にNowShowingMovieListが表示される', () => {
    render(
      <HomePage
        nowShowingMovies={[]}
        recommendations={[]}
        hasFavorites={false}
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
      />,
    );

    const appLayout = screen.getByTestId('app-layout');
    const nowShowingList = screen.getByTestId('now-showing-movie-list');
    expect(appLayout).toContainElement(nowShowingList);
  });
});
