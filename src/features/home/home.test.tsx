import { render, screen } from '@testing-library/react';

import { HomePage } from './home';

// --- Mocks ---

jest.mock('@/components/layout/appLayout/appLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='app-layout'>{children}</div>
  ),
}));

jest.mock(
  '@/features/trending/component/trendingMovieList/trendingMovieList',
  () => ({
    TrendingMovieList: () => (
      <div data-testid='trending-movie-list'>トレンド映画</div>
    ),
  }),
);

// --- Tests ---

describe('HomePage', () => {
  it('AppLayout内にTrendingMovieListが表示される', () => {
    render(<HomePage />);

    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    expect(screen.getByTestId('trending-movie-list')).toBeInTheDocument();
  });

  it('TrendingMovieListがAppLayoutの子要素である', () => {
    render(<HomePage />);

    const appLayout = screen.getByTestId('app-layout');
    const trendingList = screen.getByTestId('trending-movie-list');
    expect(appLayout).toContainElement(trendingList);
  });
});
