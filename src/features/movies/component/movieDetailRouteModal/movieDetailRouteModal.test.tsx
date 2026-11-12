/**
 * MovieDetailRouteModalコンポーネント テスト
 *
 * intercepting route から開くモーダル。開閉はルーターが持つので、
 * 閉じるは `router.back()`、履歴エントリは自分で積まない（#1033）。
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MovieDetailRouteModal } from './movieDetailRouteModal';

// --- Mocks ---

const mockBack = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ back: mockBack }),
}));

const mockUseMovieDetail = jest.fn();
jest.mock('@/features/movies/hooks/useMovieDetail', () => ({
  useMovieDetail: (movieId: number | null) => mockUseMovieDetail(movieId),
}));

const mockUseShowFinancialInfo = jest.fn();
jest.mock('@/features/movies/hooks/useShowFinancialInfo', () => ({
  useShowFinancialInfo: (movieId: number) => mockUseShowFinancialInfo(movieId),
}));

jest.mock('@/components/ui/movie/detailModal/movieDetailModal', () => ({
  MovieDetailModal: ({
    movieId,
    title,
    showFinancialInfo,
    manageHistory,
    onClose,
  }: {
    movieId: number | null;
    title?: string;
    showFinancialInfo?: boolean;
    manageHistory?: boolean;
    onClose: () => void;
  }) => (
    <div
      data-testid='movie-detail-modal'
      data-movie-id={String(movieId)}
      data-title={title ?? ''}
      data-financial={String(showFinancialInfo)}
      data-manage-history={String(manageHistory)}
    >
      <button onClick={onClose}>閉じる</button>
    </div>
  ),
}));

// --- Tests ---

describe('MovieDetailRouteModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMovieDetail.mockReturnValue({
      movie: { title: 'テスト映画' },
      isLoading: false,
      isError: false,
    });
    mockUseShowFinancialInfo.mockReturnValue(false);
  });

  it('渡されたIDでモーダルを開く', () => {
    render(<MovieDetailRouteModal movieId={550} />);

    expect(screen.getByTestId('movie-detail-modal')).toHaveAttribute(
      'data-movie-id',
      '550',
    );
  });

  it('取得した作品名をモーダルのタイトルにする', () => {
    render(<MovieDetailRouteModal movieId={550} />);

    expect(screen.getByTestId('movie-detail-modal')).toHaveAttribute(
      'data-title',
      'テスト映画',
    );
  });

  it('取得前はタイトルを渡さない（既定の「映画詳細」に任せる）', () => {
    mockUseMovieDetail.mockReturnValue({
      movie: undefined,
      isLoading: true,
      isError: false,
    });

    render(<MovieDetailRouteModal movieId={550} />);

    expect(screen.getByTestId('movie-detail-modal')).toHaveAttribute(
      'data-title',
      '',
    );
  });

  it('予算・興行収入の出し分けを引き継ぐ', () => {
    mockUseShowFinancialInfo.mockReturnValue(true);

    render(<MovieDetailRouteModal movieId={550} />);

    expect(mockUseShowFinancialInfo).toHaveBeenCalledWith(550);
    expect(screen.getByTestId('movie-detail-modal')).toHaveAttribute(
      'data-financial',
      'true',
    );
  });

  // 遷移そのものが履歴エントリなので、モーダル側で積ませない
  it('履歴エントリを自分で積まない', () => {
    render(<MovieDetailRouteModal movieId={550} />);

    expect(screen.getByTestId('movie-detail-modal')).toHaveAttribute(
      'data-manage-history',
      'false',
    );
  });

  it('閉じると1つ前の履歴へ戻る', async () => {
    const user = userEvent.setup();
    render(<MovieDetailRouteModal movieId={550} />);

    await user.click(screen.getByRole('button', { name: '閉じる' }));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
