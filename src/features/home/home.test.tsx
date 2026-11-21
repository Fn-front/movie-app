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
   * ⛔ **ホームはモーダルを描かない**（#1077）
   *
   * 描くのは `AppLayout` の1箇所だけ。以前は `NowShowingMovieList` と
   * `RecommendationSection` が両方描き、その後ホーム専用の1つにまとめ、
   * 今回アプリ全体で1つに統合した。
   *
   * ⚠️ ここは**セクションがモーダルを描き直す退行は検出しない**。上で
   * セクションを両方ともモックしているため中身が見えない。その退行は
   * 各セクションのテスト（`nowShowingMovieList.test.tsx` /
   * `recommendationSection.test.tsx` の「モーダル自体は描かない」）が受け持つ。
   */
  it('ホーム自身はモーダルを描かない', () => {
    render(<HomePage nowShowingMovies={[]} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
