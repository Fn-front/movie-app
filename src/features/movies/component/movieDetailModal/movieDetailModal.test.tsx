/**
 * MovieDetailModalコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';

import { MovieDetailModal } from './movieDetailModal';

// --- Mocks ---

jest.mock(
  '@/features/movies/component/movieDetailContent/movieDetailContent',
  () => ({
    MovieDetailContent: ({ movieId }: { movieId: number }) => (
      <div data-testid='movie-detail-content'>Movie {movieId}</div>
    ),
  }),
);

jest.mock('@/components/ui/modal/modal', () => ({
  Modal: ({
    open,
    children,
    title,
  }: {
    open: boolean;
    children: React.ReactNode;
    title: string;
  }) =>
    open ? (
      <div data-testid='modal' aria-label={title}>
        {children}
      </div>
    ) : null,
}));

// --- Tests ---

describe('MovieDetailModal', () => {
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
});
