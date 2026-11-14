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
    render(<HomePage nowShowingMovies={[]} />);

    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    expect(screen.getByTestId('now-showing-movie-list')).toBeInTheDocument();
  });

  it('NowShowingMovieListがAppLayoutの子要素である', () => {
    render(<HomePage nowShowingMovies={[]} />);

    const appLayout = screen.getByTestId('app-layout');
    const nowShowingList = screen.getByTestId('now-showing-movie-list');
    expect(appLayout).toContainElement(nowShowingList);
  });

  /**
   * 認証状態で出し分けないのは**意図した構成**（#1115）。
   *
   * ホームで `auth()` を呼ぶとルート全体が動的になり、遷移のたびに
   * サーバー往復が発生する。出し分けはセクション側がクライアントで行う
   * （`recommendationSection.test.tsx` の「表示の前提」が受け持つ）
   */
  it('RecommendationSectionは認証状態を見ずに常に置かれる', () => {
    render(<HomePage nowShowingMovies={[]} />);

    expect(screen.getByTestId('recommendation-section')).toBeInTheDocument();
  });

  /**
   * 詳細モーダルはホームに1つだけ
   *
   * 以前は `NowShowingMovieList` と `RecommendationSection` が**両方**
   * モーダルを描いていた。どちらも URL の `movie_id` を読むため、
   * タイルを押すと2枚同時に開いていた（E2E が
   * `getByRole('dialog') resolved to 2 elements` で落ちた / #1033）。
   *
   * ⚠️ ここは**セクションがモーダルを描き直す退行は検出しない**。上で
   * セクションを両方ともモックしているため、中身が見えないため。
   * その退行は各セクションのテスト（`nowShowingMovieList.test.tsx` /
   * `recommendationSection.test.tsx` の「モーダル自体は描かない」）が受け持つ。
   */
  it('詳細モーダルは1つだけ描かれる', () => {
    render(<HomePage nowShowingMovies={[]} />);

    expect(screen.getAllByTestId('home-movie-detail-modal')).toHaveLength(1);
  });
});
