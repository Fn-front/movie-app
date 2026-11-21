/**
 * AppMovieDetailModal テスト（#1077）
 */

import { render, screen } from '@testing-library/react';

const mockPathname = jest.fn(() => '/');
const mockCloseMovieDetail = jest.fn();
const mockSelectedMovieId = { current: null as number | null };
const mockShowFinancialInfo = jest.fn<boolean, [number | null]>(() => true);

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

jest.mock('@/features/movies/hooks/useMovieDetailQuery', () => ({
  useMovieDetailQuery: () => ({
    selectedMovieId: mockSelectedMovieId.current,
    openMovieDetail: jest.fn(),
    closeMovieDetail: mockCloseMovieDetail,
  }),
}));

jest.mock('@/features/movies/hooks/useShowFinancialInfo', () => ({
  useShowFinancialInfo: (movieId: number | null) =>
    mockShowFinancialInfo(movieId),
}));

jest.mock('@/components/ui/movie/detailModal/movieDetailModal', () => ({
  MovieDetailModal: ({
    movieId,
    title,
    showFinancialInfo,
    manageHistory,
  }: {
    movieId: number | null;
    title?: string;
    showFinancialInfo?: boolean;
    manageHistory?: boolean;
  }) =>
    movieId === null ? null : (
      <div
        data-testid='movie-detail-modal'
        data-financial={String(Boolean(showFinancialInfo))}
        data-manage-history={String(Boolean(manageHistory))}
        data-title={title ?? ''}
      />
    ),
}));

import { AppMovieDetailModal } from './appMovieDetailModal';

describe('AppMovieDetailModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname.mockReturnValue('/');
    mockSelectedMovieId.current = null;
    mockShowFinancialInfo.mockReturnValue(true);
  });

  it('movie_id が無ければ何も描かない', () => {
    render(<AppMovieDetailModal />);

    expect(screen.queryByTestId('movie-detail-modal')).not.toBeInTheDocument();
  });

  it('movie_id があれば開く', () => {
    mockSelectedMovieId.current = 42;

    render(<AppMovieDetailModal />);

    expect(screen.getByTestId('movie-detail-modal')).toBeInTheDocument();
  });

  /**
   * ⛔ 開く側（`history.pushState`）が既にエントリを積んでいる。
   * ここでも積むと開くたびに履歴が2つ伸びる（#1033）。
   */
  it('履歴は自分で積まない', () => {
    mockSelectedMovieId.current = 42;

    render(<AppMovieDetailModal />);

    expect(screen.getByTestId('movie-detail-modal')).toHaveAttribute(
      'data-manage-history',
      'false',
    );
  });

  /**
   * ⚠️ ここには一覧データが無いので `title` を渡さない。
   * `MovieDetailModal` が取得済みの詳細から作品名を出す。
   */
  it('title は渡さない（取得済みの詳細に任せる）', () => {
    mockSelectedMovieId.current = 42;

    render(<AppMovieDetailModal />);

    expect(screen.getByTestId('movie-detail-modal')).toHaveAttribute(
      'data-title',
      '',
    );
  });

  /**
   * ⛔ **出し分けを変えない**（#1077 の完了条件）
   *
   * 統合前に予算・興行収入を出していたのは `movieListContent` だけで、
   * それを描くのは `/movies/now-showing` と `/movies/upcoming` の2ルート。
   * モーダルが1つになると「どの画面から開いたか」を知らないため、
   * パスで同じ範囲を再現している。
   */
  describe('予算・興行収入の出し分け', () => {
    it.each(['/movies/now-showing', '/movies/upcoming'])(
      '%s では出す',
      (pathname) => {
        mockPathname.mockReturnValue(pathname);
        mockSelectedMovieId.current = 42;

        render(<AppMovieDetailModal />);

        expect(screen.getByTestId('movie-detail-modal')).toHaveAttribute(
          'data-financial',
          'true',
        );
      },
    );

    it.each(['/', '/search', '/awards', '/watchlist', '/favorites'])(
      '%s では出さない',
      (pathname) => {
        mockPathname.mockReturnValue(pathname);
        mockSelectedMovieId.current = 42;

        render(<AppMovieDetailModal />);

        expect(screen.getByTestId('movie-detail-modal')).toHaveAttribute(
          'data-financial',
          'false',
        );
      },
    );

    /** 公開前の作品では一覧のパスでも出さない（判定は詳細データ側） */
    it('詳細データ側が false なら一覧のパスでも出さない', () => {
      mockPathname.mockReturnValue('/movies/now-showing');
      mockSelectedMovieId.current = 42;
      mockShowFinancialInfo.mockReturnValue(false);

      render(<AppMovieDetailModal />);

      expect(screen.getByTestId('movie-detail-modal')).toHaveAttribute(
        'data-financial',
        'false',
      );
    });
  });
});
