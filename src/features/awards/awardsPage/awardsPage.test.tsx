import { render, screen, fireEvent } from '@testing-library/react';

import { AwardsPage } from './awardsPage';

// --- Mocks ---

jest.mock('@/components/ui/loading/loading', () => ({
  Loading: ({ label }: { label?: string }) => (
    <div data-testid='loading'>{label}</div>
  ),
}));

jest.mock('@/components/ui/movie/movieTile/movieTile', () => ({
  MovieTile: ({
    movie,
    onClick,
  }: {
    movie: { id: number; title: string };
    onClick?: (movieId: number) => void;
  }) => (
    <div
      data-testid={`movie-tile-${movie.id}`}
      role='button'
      tabIndex={0}
      onClick={() => onClick?.(movie.id)}
      onKeyDown={() => {}}
    >
      {movie.title}
    </div>
  ),
}));

jest.mock('@/components/ui/movie/detailModal/movieDetailModal', () => ({
  MovieDetailModal: ({
    movieId,
    onClose,
  }: {
    movieId: number | null;
    onClose: () => void;
  }) =>
    movieId ? (
      <div data-testid='movie-detail-modal'>
        <span>Movie ID: {movieId}</span>
        <button onClick={onClose}>閉じる</button>
      </div>
    ) : null,
}));

jest.mock(
  '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal',
  () => ({
    FavoriteRatingModal: () => <div data-testid='favorite-rating-modal' />,
  }),
);

jest.mock('@/features/favorites/hooks/useFavoriteToggle', () => ({
  useFavoriteToggle: () => ({
    modalState: { isOpen: false, movie: null, currentFavorite: null },
    handleFavoriteToggle: jest.fn(),
    closeModal: jest.fn(),
    handleModalSubmit: jest.fn(),
    handleDelete: jest.fn(),
    isFavoriteProcessing: jest.fn().mockReturnValue(false),
  }),
}));

jest.mock('@/features/watchlist/hooks/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({
    isInWatchlist: jest.fn().mockReturnValue(false),
    toggleWatchlist: jest.fn(),
    isToggling: false,
    isMovieToggling: jest.fn().mockReturnValue(false),
  }),
}));

const mockUseAwardsReturn = {
  data: undefined as
    | {
        year: number;
        availableYears: number[];
        awards: {
          awardName: string;
          label: string;
          categories: {
            category: string;
            label: string;
            winner: {
              tmdbMovieId: number;
              title: string;
              posterPath: string | null;
              releaseDate: string | null;
              voteAverage: number | null;
              genreIds: number[] | null;
            } | null;
            nominees: {
              tmdbMovieId: number;
              title: string;
              posterPath: string | null;
              releaseDate: string | null;
              voteAverage: number | null;
              genreIds: number[] | null;
            }[];
          }[];
        }[];
      }
    | undefined,
  isLoading: false,
  isError: false,
  selectedYear: 2026,
  handleYearChange: jest.fn(),
};

jest.mock('@/features/awards/hooks/useAwards', () => ({
  useAwards: () => mockUseAwardsReturn,
}));

jest.mock('@/components/ui/select/select', () => ({
  Select: ({
    value,
    onValueChange,
    options,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    options: { label: string; value: string }[];
  }) => (
    <select
      data-testid='year-select'
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {options.map((opt: { label: string; value: string }) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

// --- Helpers ---

const createMockAwardsData = () => ({
  year: 2026,
  availableYears: [2026, 2025],
  awards: [
    {
      awardName: 'academy_awards',
      label: 'アカデミー賞',
      categories: [
        {
          category: 'best_picture',
          label: '作品賞',
          winner: {
            tmdbMovieId: 100,
            title: '受賞映画',
            posterPath: '/winner.jpg',
            releaseDate: '2025-12-01',
            voteAverage: 8.5,
            genreIds: [18],
          },
          nominees: [
            {
              tmdbMovieId: 100,
              title: '受賞映画',
              posterPath: '/winner.jpg',
              releaseDate: '2025-12-01',
              voteAverage: 8.5,
              genreIds: [18],
            },
            {
              tmdbMovieId: 200,
              title: 'ノミネート映画',
              posterPath: '/nominee.jpg',
              releaseDate: '2025-11-01',
              voteAverage: 7.5,
              genreIds: [18],
            },
          ],
        },
      ],
    },
  ],
});

// --- Tests ---

describe('AwardsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAwardsReturn.data = undefined;
    mockUseAwardsReturn.isLoading = false;
    mockUseAwardsReturn.isError = false;
    mockUseAwardsReturn.selectedYear = 2026;
  });

  it('ローディング中にLoadingが表示される', () => {
    mockUseAwardsReturn.isLoading = true;

    render(<AwardsPage />);

    expect(screen.getByText('受賞作品')).toBeInTheDocument();
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('エラー時にエラーメッセージが表示される', () => {
    mockUseAwardsReturn.isError = true;

    render(<AwardsPage />);

    expect(
      screen.getByText('受賞作品データの取得に失敗しました。'),
    ).toBeInTheDocument();
  });

  it('データがない場合にデータなしメッセージが表示される', () => {
    mockUseAwardsReturn.data = {
      year: 2026,
      availableYears: [2026],
      awards: [],
    };

    render(<AwardsPage />);

    expect(
      screen.getByText('選択した年度の受賞作品データはまだありません。'),
    ).toBeInTheDocument();
  });

  it('受賞作品データが正しく表示される', () => {
    mockUseAwardsReturn.data = createMockAwardsData();

    render(<AwardsPage />);

    expect(screen.getByText('アカデミー賞')).toBeInTheDocument();
    expect(screen.getAllByText('作品賞').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('受賞映画')).toBeInTheDocument();
    expect(screen.getByText('ノミネート映画')).toBeInTheDocument();
  });

  it('年度セレクトが表示される', () => {
    mockUseAwardsReturn.data = createMockAwardsData();

    render(<AwardsPage />);

    const select = screen.getByTestId('year-select');
    expect(select).toBeInTheDocument();
  });

  it('年度変更でhandleYearChangeが呼ばれる', () => {
    mockUseAwardsReturn.data = createMockAwardsData();

    render(<AwardsPage />);

    const select = screen.getByTestId('year-select');
    fireEvent.change(select, { target: { value: '2025' } });

    expect(mockUseAwardsReturn.handleYearChange).toHaveBeenCalledWith('2025');
  });

  it('映画クリックでモーダルが表示される', () => {
    mockUseAwardsReturn.data = createMockAwardsData();

    render(<AwardsPage />);

    const movieTile = screen.getByTestId('movie-tile-200');
    fireEvent.click(movieTile);

    expect(screen.getByTestId('movie-detail-modal')).toBeInTheDocument();
  });

  it('受賞ラベルが表示される', () => {
    mockUseAwardsReturn.data = createMockAwardsData();

    render(<AwardsPage />);

    expect(screen.getByText('受賞')).toBeInTheDocument();
  });

  it('ノミネートラベルが表示される', () => {
    mockUseAwardsReturn.data = createMockAwardsData();

    render(<AwardsPage />);

    expect(screen.getByText('ノミネート')).toBeInTheDocument();
  });
});
