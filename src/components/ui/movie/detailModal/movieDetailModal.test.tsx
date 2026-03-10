/**
 * MovieDetailModalコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MovieDetailModal } from './movieDetailModal';

// --- Mocks ---

let capturedOnOpenChange: ((open: boolean) => void) | undefined;

jest.mock(
  '@/features/movies/component/movieDetailContent/movieDetailContent',
  () => ({
    MovieDetailContent: ({
      movieId,
      showFinancialInfo,
    }: {
      movieId: number;
      showFinancialInfo?: boolean;
    }) => (
      <div data-testid='movie-detail-content'>
        Movie {movieId}
        {showFinancialInfo && (
          <span data-testid='financial-info'>financial</span>
        )}
      </div>
    ),
  }),
);

jest.mock('@/components/ui/modal/modal', () => ({
  Modal: ({
    open,
    children,
    title,
    onOpenChange,
  }: {
    open: boolean;
    children: React.ReactNode;
    title: string;
    onOpenChange: (open: boolean) => void;
  }) => {
    capturedOnOpenChange = onOpenChange;
    return open ? (
      <div data-testid='modal' aria-label={title}>
        <button data-testid='close-trigger' onClick={() => onOpenChange(false)}>
          閉じる
        </button>
        {children}
      </div>
    ) : null;
  },
}));

// --- Tests ---

describe('MovieDetailModal', () => {
  beforeEach(() => {
    capturedOnOpenChange = undefined;
  });

  it('movieIdがnullの場合モーダルを表示しない', () => {
    render(<MovieDetailModal movieId={null} onClose={jest.fn()} />);

    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('movieIdが指定されている場合モーダルを表示する', () => {
    render(<MovieDetailModal movieId={123} onClose={jest.fn()} />);

    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId('movie-detail-content')).toBeInTheDocument();
    expect(screen.getByText('Movie 123')).toBeInTheDocument();
  });

  it('モーダルのタイトルが映画詳細である', () => {
    render(<MovieDetailModal movieId={123} onClose={jest.fn()} />);

    expect(screen.getByLabelText('映画詳細')).toBeInTheDocument();
  });

  it('モーダルを閉じるとonCloseが呼ばれる', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<MovieDetailModal movieId={123} onClose={onClose} />);

    await user.click(screen.getByTestId('close-trigger'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('onOpenChangeでopen=trueの場合onCloseは呼ばれない', () => {
    const onClose = jest.fn();
    render(<MovieDetailModal movieId={123} onClose={onClose} />);

    // open=trueでonOpenChangeを呼ぶ
    capturedOnOpenChange?.(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('showFinancialInfo=trueの場合MovieDetailContentにpropsが渡される', () => {
    render(
      <MovieDetailModal
        movieId={123}
        showFinancialInfo={true}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('financial-info')).toBeInTheDocument();
  });

  it('showFinancialInfoを指定しない場合デフォルトで非表示', () => {
    render(<MovieDetailModal movieId={123} onClose={jest.fn()} />);

    expect(screen.queryByTestId('financial-info')).not.toBeInTheDocument();
  });

  it('movieIdがnullの場合MovieDetailContentがレンダリングされない', () => {
    render(<MovieDetailModal movieId={null} onClose={jest.fn()} />);

    expect(
      screen.queryByTestId('movie-detail-content'),
    ).not.toBeInTheDocument();
  });
});
