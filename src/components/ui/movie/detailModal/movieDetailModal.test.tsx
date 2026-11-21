/**
 * MovieDetailModalコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MovieDetailModal } from './movieDetailModal';

// --- Mocks ---

let capturedOnOpenChange: ((open: boolean) => void) | undefined;

/**
 * 取得済みの詳細から作品名を出すようになった（#1077）
 *
 * ⚠️ 実体は API クライアント経由で `next-auth/react`（ESM）まで辿るため、
 * モックしないと jest が読み込めない。
 */
const mockUseMovieDetail = jest.fn<
  {
    movie: { title: string } | undefined;
    isLoading: boolean;
    isError: boolean;
  },
  [number | null]
>(() => ({ movie: undefined, isLoading: false, isError: false }));
jest.mock('@/features/movies/hooks/useMovieDetail', () => ({
  useMovieDetail: (movieId: number | null) => mockUseMovieDetail(movieId),
}));

jest.mock(
  '@/features/movies/component/movieDetailContent/movieDetailContent',
  () => ({
    MovieDetailContent: ({
      movieId,
      showFinancialInfo,
      onRequestClose,
    }: {
      movieId: number;
      showFinancialInfo?: boolean;
      onRequestClose?: () => void;
    }) => (
      <div
        data-testid='movie-detail-content'
        data-has-request-close={String(Boolean(onRequestClose))}
      >
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
  /**
   * 作品名の出どころ（#1077）
   *
   * ⛔ モーダルを描くのは `AppLayout` の1箇所だけになったが、あそこには
   * 一覧データが無い。取得済みの詳細から出せないと、どの作品を開いても
   * ダイアログ名が「映画詳細」のままになる。
   */
  describe('作品名（#1077）', () => {
    it('title を渡さなければ取得済みの詳細から出す', () => {
      mockUseMovieDetail.mockReturnValue({
        movie: { title: '取得した作品名' },
        isLoading: false,
        isError: false,
      });

      render(<MovieDetailModal movieId={123} onClose={jest.fn()} />);

      expect(screen.getByTestId('modal')).toHaveAttribute(
        'aria-label',
        '取得した作品名',
      );
    });

    /** ⚠️ 一覧データを持つ呼び出し側は従来どおり即座に出せる */
    it('title を渡せばそちらが優先される', () => {
      mockUseMovieDetail.mockReturnValue({
        movie: { title: '取得した作品名' },
        isLoading: false,
        isError: false,
      });

      render(
        <MovieDetailModal
          movieId={123}
          title='渡した名前'
          onClose={jest.fn()}
        />,
      );

      expect(screen.getByTestId('modal')).toHaveAttribute(
        'aria-label',
        '渡した名前',
      );
    });

    it('取得前は既定の文言に落ちる', () => {
      mockUseMovieDetail.mockReturnValue({
        movie: undefined,
        isLoading: true,
        isError: false,
      });

      render(<MovieDetailModal movieId={123} onClose={jest.fn()} />);

      expect(screen.getByTestId('modal')).toHaveAttribute(
        'aria-label',
        '映画詳細',
      );
    });
  });
});
