/**
 * MovieDetailPageコンポーネント テスト
 *
 * `/movies/[id]` を直接開いたときの全画面表示。モーダルと同じ
 * `MovieDetailContent` を、ページ用の見た目で描く（#1033）。
 */

import { render, screen } from '@testing-library/react';

import { MovieDetailPage } from './movieDetailPage';

// --- Mocks ---

const mockUseShowFinancialInfo = jest.fn();
jest.mock('@/features/movies/hooks/useShowFinancialInfo', () => ({
  useShowFinancialInfo: (movieId: number) => mockUseShowFinancialInfo(movieId),
}));

jest.mock(
  '@/features/movies/component/movieDetailContent/movieDetailContent',
  () => ({
    MovieDetailContent: ({
      movieId,
      showFinancialInfo,
      variant,
    }: {
      movieId: number;
      showFinancialInfo?: boolean;
      variant?: string;
    }) => (
      <div
        data-testid='movie-detail-content'
        data-movie-id={String(movieId)}
        data-financial={String(showFinancialInfo)}
        data-variant={variant}
      />
    ),
  }),
);

// --- Tests ---

describe('MovieDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseShowFinancialInfo.mockReturnValue(false);
  });

  it('渡されたIDの詳細を描画する', () => {
    render(<MovieDetailPage movieId={550} />);

    expect(screen.getByTestId('movie-detail-content')).toHaveAttribute(
      'data-movie-id',
      '550',
    );
  });

  // モーダルと器が違うので、見出しレベルと内部スクロールを切り替える
  it('ページ用の見た目で描画する', () => {
    render(<MovieDetailPage movieId={550} />);

    expect(screen.getByTestId('movie-detail-content')).toHaveAttribute(
      'data-variant',
      'page',
    );
  });

  it('予算・興行収入の出し分けを引き継ぐ', () => {
    mockUseShowFinancialInfo.mockReturnValue(true);

    render(<MovieDetailPage movieId={550} />);

    expect(mockUseShowFinancialInfo).toHaveBeenCalledWith(550);
    expect(screen.getByTestId('movie-detail-content')).toHaveAttribute(
      'data-financial',
      'true',
    );
  });
});
