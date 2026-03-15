/**
 * FavoritesPageコンポーネント テスト
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FavoritesPage } from './favoritesPage';

// --- Mocks ---

const mockHandleFavoriteToggle = jest.fn();
const mockCloseModal = jest.fn();
const mockHandleModalSubmit = jest.fn();
const mockHandleDelete = jest.fn();
const mockHandleSortChange = jest.fn();

let mockSortBy = 'added_at';
let mockFavorites: Array<{
  id: string;
  tmdb_movie_id: number;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  rating: number;
  added_at: string;
}> = [];
let mockIsLoading = false;
let mockIsFetchingNextPage = false;
let mockHasNextPage = false;
const mockFetchNextPage = jest.fn();

jest.mock('@/features/favorites/hooks/useFavoritesPage', () => ({
  useFavoritesPage: () => ({
    favorites: mockFavorites,
    isLoading: mockIsLoading,
    isFetchingNextPage: mockIsFetchingNextPage,
    hasNextPage: mockHasNextPage,
    fetchNextPage: mockFetchNextPage,
    sortBy: mockSortBy,
    handleSortChange: mockHandleSortChange,
    favoriteToggle: {
      modalState: { isOpen: false, movie: null, currentFavorite: null },
      handleFavoriteToggle: mockHandleFavoriteToggle,
      closeModal: mockCloseModal,
      handleModalSubmit: mockHandleModalSubmit,
      handleDelete: mockHandleDelete,
      isFavoriteProcessing: jest.fn().mockReturnValue(false),
    },
  }),
  FAVORITES_PAGE_SORT_OPTIONS: [
    { label: '登録日順', value: 'added_at' },
    { label: '評価順', value: 'rating' },
  ],
}));

// next/imageモック
jest.mock('next/image', () => {
  const MockImage = (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt='' {...props} />;
  };
  MockImage.displayName = 'MockImage';
  return { __esModule: true, default: MockImage };
});

jest.mock('@/utils/image', () => ({
  getTMDbPosterUrl: (path: string | null) =>
    path ? `https://image.tmdb.org/t/p/w500${path}` : null,
}));

jest.mock('@/components/ui/movie/detailModal/movieDetailModal', () => ({
  MovieDetailModal: jest.fn(() => null),
}));

jest.mock('@/hooks/useIntersectionObserver', () => ({
  useIntersectionObserver: jest.fn().mockReturnValue(jest.fn()),
}));

// --- Tests ---

describe('FavoritesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSortBy = 'added_at';
    mockIsLoading = false;
    mockIsFetchingNextPage = false;
    mockHasNextPage = false;
    mockFavorites = [
      {
        id: 'fav-1',
        tmdb_movie_id: 100,
        title: '映画A',
        poster_path: '/a.jpg',
        release_date: '2026-01-01',
        rating: 8,
        added_at: '2026-01-10T00:00:00Z',
      },
      {
        id: 'fav-2',
        tmdb_movie_id: 200,
        title: '映画B',
        poster_path: '/b.jpg',
        release_date: '2026-02-01',
        rating: 5,
        added_at: '2026-02-15T00:00:00Z',
      },
    ];
  });

  it('ページタイトル「お気に入り」が表示される', () => {
    render(<FavoritesPage />);

    expect(
      screen.getByRole('heading', { name: 'お気に入り' }),
    ).toBeInTheDocument();
  });

  it('ソートSelectが表示される', () => {
    render(<FavoritesPage />);

    expect(
      screen.getByRole('combobox', { name: 'ソート順を選択' }),
    ).toBeInTheDocument();
  });

  it('お気に入り一覧が表示される', () => {
    render(<FavoritesPage />);

    expect(screen.getByText('映画A')).toBeInTheDocument();
    expect(screen.getByText('映画B')).toBeInTheDocument();
  });

  it('FavoriteButtonクリックでhandleFavoriteToggleが呼ばれる', async () => {
    const user = userEvent.setup();

    render(<FavoritesPage />);

    const favoriteButtons = screen.getAllByRole('button', {
      name: 'お気に入りを編集',
    });
    await user.click(favoriteButtons[0]);

    expect(mockHandleFavoriteToggle).toHaveBeenCalledWith(
      {
        id: 100,
        title: '映画A',
        poster_path: '/a.jpg',
        release_date: '2026-01-01',
      },
      { id: 'fav-1', rating: 8 },
    );
  });

  it('空状態でメッセージが表示される', () => {
    mockFavorites = [];

    render(<FavoritesPage />);

    expect(
      screen.getByText('お気に入りの映画を追加しましょう'),
    ).toBeInTheDocument();
  });

  it('タイルクリックで詳細モーダルにmovieIdが渡される', async () => {
    const { MovieDetailModal } = jest.requireMock(
      '@/components/ui/movie/detailModal/movieDetailModal',
    );

    const user = userEvent.setup();

    render(<FavoritesPage />);

    await user.click(screen.getByText('映画A'));

    expect(MovieDetailModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ movieId: 100 }),
      expect.anything(),
    );
  });
});
