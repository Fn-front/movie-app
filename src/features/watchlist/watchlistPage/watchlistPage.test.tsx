/**
 * WatchlistPageコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { WatchlistPage } from './watchlistPage';

// --- Mocks ---

const mockUseWatchlistPage = {
  watchlist: [] as Array<{
    id: string;
    tmdb_movie_id: number;
    title: string;
    poster_path: string | null;
    release_date: string | null;
    added_at: string;
    watched_at: string | null;
  }>,
  isLoading: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: jest.fn(),
  removeFromWatchlist: jest.fn(),
  setWatched: jest.fn(),
  isUpdatingWatched: false,
  sortBy: 'added_at' as const,
  handleSortChange: jest.fn(),
};

jest.mock('@/features/watchlist/hooks/useWatchlistPage', () => ({
  useWatchlistPage: () => mockUseWatchlistPage,
  WATCHLIST_PAGE_SORT_OPTIONS: [
    { label: '追加日順', value: 'added_at' },
    { label: '公開日が近い順', value: 'release_date_proximity' },
  ],
}));

const mockHandleFavoriteToggle = jest.fn();
const mockGetFavoriteInfo = jest.fn().mockReturnValue(null);
jest.mock('@/features/favorites/hooks/useFavoriteToggle', () => ({
  useFavoriteToggle: () => ({
    modalState: { isOpen: false, movie: null, currentFavorite: null },
    handleFavoriteToggle: mockHandleFavoriteToggle,
    closeModal: jest.fn(),
    handleModalSubmit: jest.fn(),
    handleDelete: jest.fn(),
    isProcessing: false,
    isFavoriteProcessing: jest.fn().mockReturnValue(false),
    getFavoriteInfo: mockGetFavoriteInfo,
  }),
}));

jest.mock(
  '@/features/favorites/component/favoriteRatingModal/favoriteRatingModal',
  () => ({
    FavoriteRatingModal: ({ isOpen }: { isOpen: boolean }) =>
      isOpen ? <div data-testid='favorite-rating-modal' /> : null,
  }),
);

jest.mock('@/hooks/useIntersectionObserver', () => ({
  useIntersectionObserver: () => ({ current: null }),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

jest.mock('@/components/ui/movie/movieTileSkeleton/movieTileSkeleton', () => ({
  MovieTileSkeleton: ({ count }: { count: number }) => (
    <div data-testid='movie-tile-skeleton'>skeleton x {count}</div>
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
        Movie {movieId}
        <button data-testid='close-modal' onClick={onClose}>
          閉じる
        </button>
      </div>
    ) : null,
}));

// --- Helpers ---

const createMockItems = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `wl-${i}`,
    tmdb_movie_id: 100 + i,
    title: `映画${i}`,
    poster_path: `/poster${i}.jpg`,
    release_date: '2026-03-01',
    added_at: `2026-03-${String(10 - i).padStart(2, '0')}T00:00:00Z`,
    watched_at: null,
  }));

// --- Tests ---

describe('WatchlistPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWatchlistPage.watchlist = [];
    mockUseWatchlistPage.isLoading = false;
    mockUseWatchlistPage.isFetchingNextPage = false;
    mockUseWatchlistPage.hasNextPage = false;
    mockUseWatchlistPage.sortBy = 'added_at';
    mockUseWatchlistPage.isUpdatingWatched = false;
    mockGetFavoriteInfo.mockReturnValue(null);
  });

  it('タイトルが表示される', () => {
    render(<WatchlistPage />);

    expect(
      screen.getByRole('heading', { name: 'ウォッチリスト' }),
    ).toBeInTheDocument();
  });

  it('ソートセレクトが表示される', () => {
    render(<WatchlistPage />);

    expect(
      screen.getByRole('combobox', { name: 'ソート順を選択' }),
    ).toBeInTheDocument();
  });

  it('空状態が表示される', () => {
    render(<WatchlistPage />);

    expect(
      screen.getByText('ウォッチリストに映画を追加しましょう'),
    ).toBeInTheDocument();
  });

  it('一覧が表示される', () => {
    mockUseWatchlistPage.watchlist = createMockItems(3);
    render(<WatchlistPage />);

    expect(screen.getByText('映画0')).toBeInTheDocument();
    expect(screen.getByText('映画1')).toBeInTheDocument();
    expect(screen.getByText('映画2')).toBeInTheDocument();
  });

  it('タイルクリックで詳細モーダルが表示される', async () => {
    const user = userEvent.setup();
    mockUseWatchlistPage.watchlist = createMockItems(1);
    render(<WatchlistPage />);

    await user.click(screen.getByRole('button', { name: '映画0' }));

    expect(screen.getByTestId('movie-detail-modal')).toBeInTheDocument();
  });

  it('モーダル閉じるで非表示になる', async () => {
    const user = userEvent.setup();
    mockUseWatchlistPage.watchlist = createMockItems(1);
    render(<WatchlistPage />);

    await user.click(screen.getByRole('button', { name: '映画0' }));
    await user.click(screen.getByTestId('close-modal'));

    expect(screen.queryByTestId('movie-detail-modal')).not.toBeInTheDocument();
  });

  it('削除でremoveFromWatchlistが呼ばれる', async () => {
    const user = userEvent.setup();
    mockUseWatchlistPage.watchlist = createMockItems(1);
    render(<WatchlistPage />);

    await user.click(
      screen.getByRole('button', {
        name: '映画0をウォッチリストから削除',
      }),
    );

    expect(mockUseWatchlistPage.removeFromWatchlist).toHaveBeenCalledWith(
      'wl-0',
    );
  });

  it('ローディング中にスケルトンが表示される', () => {
    mockUseWatchlistPage.isLoading = true;
    render(<WatchlistPage />);

    expect(screen.getByTestId('movie-tile-skeleton')).toBeInTheDocument();
  });

  it('次ページ読み込み中にローディングが表示される', () => {
    mockUseWatchlistPage.watchlist = createMockItems(3);
    mockUseWatchlistPage.isFetchingNextPage = true;
    mockUseWatchlistPage.hasNextPage = true;
    render(<WatchlistPage />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  describe('視聴済み', () => {
    it('視聴済みボタンが表示される', () => {
      mockUseWatchlistPage.watchlist = createMockItems(1);
      render(<WatchlistPage />);

      expect(
        screen.getByRole('button', { name: '映画0を視聴済みにする' }),
      ).toBeInTheDocument();
    });

    it('視聴済みにするとsetWatchedが呼ばれる', async () => {
      const user = userEvent.setup();
      mockUseWatchlistPage.watchlist = createMockItems(1);
      render(<WatchlistPage />);

      await user.click(
        screen.getByRole('button', { name: '映画0を視聴済みにする' }),
      );

      expect(mockUseWatchlistPage.setWatched).toHaveBeenCalledWith(
        'wl-0',
        true,
      );
    });

    it('視聴済みにすると評価モーダルを開く', async () => {
      const user = userEvent.setup();
      mockUseWatchlistPage.watchlist = createMockItems(1);
      render(<WatchlistPage />);

      await user.click(
        screen.getByRole('button', { name: '映画0を視聴済みにする' }),
      );

      expect(mockHandleFavoriteToggle).toHaveBeenCalledWith(
        expect.objectContaining({ id: 100, title: '映画0' }),
        null,
      );
    });

    it('お気に入り登録済みなら現在の評価を渡して編集モードで開く', async () => {
      const user = userEvent.setup();
      const favorite = { id: 'fav-1', rating: 8 };
      mockGetFavoriteInfo.mockReturnValue(favorite);
      mockUseWatchlistPage.watchlist = createMockItems(1);
      render(<WatchlistPage />);

      await user.click(
        screen.getByRole('button', { name: '映画0を視聴済みにする' }),
      );

      expect(mockHandleFavoriteToggle).toHaveBeenCalledWith(
        expect.anything(),
        favorite,
      );
    });

    it('未視聴に戻すときは評価モーダルを開かない', async () => {
      const user = userEvent.setup();
      mockUseWatchlistPage.watchlist = createMockItems(1).map((item) => ({
        ...item,
        watched_at: '2026-03-01T00:00:00Z',
      }));
      render(<WatchlistPage />);

      await user.click(
        screen.getByRole('button', { name: '映画0を未視聴に戻す' }),
      );

      expect(mockUseWatchlistPage.setWatched).toHaveBeenCalledWith(
        'wl-0',
        false,
      );
      expect(mockHandleFavoriteToggle).not.toHaveBeenCalled();
    });
  });
});
