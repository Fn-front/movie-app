/**
 * WatchlistPanelコンポーネント テスト
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { WatchlistPanel } from './watchlistPanel';
import type { WatchlistItem } from '@/lib/api/watchlist/watchlist';

// --- Mocks ---

const mockUseWatchlist = {
  watchlist: [] as WatchlistItem[],
  isLoading: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: jest.fn(),
  removeFromWatchlist: jest.fn(),
  addToWatchlist: jest.fn(),
  isInWatchlist: jest.fn(),
  getWatchlistId: jest.fn(),
  isAdding: false,
  isRemoving: false,
};

jest.mock('@/features/watchlist/hooks/useWatchlist', () => ({
  useWatchlist: () => mockUseWatchlist,
}));

jest.mock('@/hooks/useIntersectionObserver', () => ({
  useIntersectionObserver: () => ({ current: null }),
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

const createMockItems = (count: number): WatchlistItem[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `wl-${i}`,
    tmdb_movie_id: 100 + i,
    title: `映画${i}`,
    poster_path: i % 2 === 0 ? `/poster${i}.jpg` : null,
    release_date: '2026-03-01',
    added_at: `2026-03-${String(10 - i).padStart(2, '0')}T00:00:00Z`,
  }));

// --- Tests ---

describe('WatchlistPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseWatchlist.watchlist = [];
    mockUseWatchlist.isLoading = false;
    mockUseWatchlist.isFetchingNextPage = false;
    mockUseWatchlist.hasNextPage = false;
  });

  it('複数件の一覧が表示される', () => {
    mockUseWatchlist.watchlist = createMockItems(3);
    render(<WatchlistPanel />);

    expect(screen.getByText('映画0')).toBeInTheDocument();
    expect(screen.getByText('映画1')).toBeInTheDocument();
    expect(screen.getByText('映画2')).toBeInTheDocument();
  });

  it('空状態メッセージが表示される', () => {
    mockUseWatchlist.watchlist = [];
    render(<WatchlistPanel />);

    expect(
      screen.getByText('ウォッチリストに映画を追加しましょう'),
    ).toBeInTheDocument();
  });

  it('ローディング状態が表示される', () => {
    mockUseWatchlist.isLoading = true;
    render(<WatchlistPanel />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('アイテムクリックで映画詳細モーダルが表示される', async () => {
    const user = userEvent.setup();
    mockUseWatchlist.watchlist = createMockItems(1);
    render(<WatchlistPanel />);

    await user.click(screen.getByRole('button', { name: '映画0の詳細を表示' }));

    expect(screen.getByTestId('movie-detail-modal')).toBeInTheDocument();
    expect(screen.getByText('Movie 100')).toBeInTheDocument();
  });

  it('モーダル閉じるで非表示になる', async () => {
    const user = userEvent.setup();
    mockUseWatchlist.watchlist = createMockItems(1);
    render(<WatchlistPanel />);

    await user.click(screen.getByRole('button', { name: '映画0の詳細を表示' }));
    expect(screen.getByTestId('movie-detail-modal')).toBeInTheDocument();

    await user.click(screen.getByTestId('close-modal'));
    expect(screen.queryByTestId('movie-detail-modal')).not.toBeInTheDocument();
  });

  it('削除ボタンクリックでremoveFromWatchlistが呼ばれる', async () => {
    const user = userEvent.setup();
    mockUseWatchlist.watchlist = createMockItems(1);
    render(<WatchlistPanel />);

    await user.click(
      screen.getByRole('button', {
        name: '映画0をウォッチリストから削除',
      }),
    );

    expect(mockUseWatchlist.removeFromWatchlist).toHaveBeenCalledWith('wl-0');
  });

  it('次ページ読み込み中にローディングが表示される', () => {
    mockUseWatchlist.watchlist = createMockItems(3);
    mockUseWatchlist.isFetchingNextPage = true;
    mockUseWatchlist.hasNextPage = true;
    render(<WatchlistPanel />);

    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('listロールとlistitemロールが正しく設定される', () => {
    mockUseWatchlist.watchlist = createMockItems(2);
    render(<WatchlistPanel />);

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
