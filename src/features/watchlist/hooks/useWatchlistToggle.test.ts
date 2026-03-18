/**
 * useWatchlistToggle カスタムフック テスト
 */

import { renderHook, act } from '@testing-library/react';

import { WATCHLIST_SUCCESS_MESSAGES } from '@/constants/watchlist';

import { useWatchlistToggle } from './useWatchlistToggle';

// --- Mocks ---

const mockToast = jest.fn();
const mockAddWatchlist = jest.fn().mockResolvedValue({});
const mockRemoveWatchlist = jest.fn().mockResolvedValue(undefined);
const mockInvalidateQueries = jest.fn();
const mockGetQueriesData = jest.fn().mockReturnValue([]);

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueriesData: mockGetQueriesData,
    invalidateQueries: mockInvalidateQueries,
  }),
  useMutation: ({ mutationFn, onError }: { mutationFn: Function; onError?: Function }) => ({
    mutate: mutationFn,
    isPending: false,
    onError,
  }),
}));

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1' } },
    status: 'authenticated',
  }),
}));

jest.mock('@/lib/api/watchlist/watchlist', () => ({
  addWatchlist: (...args: unknown[]) => mockAddWatchlist(...args),
  removeWatchlist: (...args: unknown[]) => mockRemoveWatchlist(...args),
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    toasts: [],
    toast: mockToast,
    removeToast: jest.fn(),
    clearToasts: jest.fn(),
  }),
}));

// --- Helpers ---

const createMovie = () => ({
  id: 42,
  title: 'テスト映画',
  poster_path: '/poster.jpg',
  release_date: '2026-01-01',
});

const setupCacheWithItem = (tmdbMovieId: number, watchlistId: string) => {
  mockGetQueriesData.mockReturnValue([
    [
      ['watchlist', 'list', { sort: 'release_date_proximity' }],
      {
        pages: [
          {
            data: {
              watchlist: [
                {
                  id: watchlistId,
                  tmdb_movie_id: tmdbMovieId,
                  title: 'テスト映画',
                  poster_path: '/poster.jpg',
                  release_date: '2026-01-01',
                  added_at: '2026-01-01T00:00:00Z',
                },
              ],
              next_cursor: null,
              has_more: false,
            },
          },
        ],
        pageParams: [undefined],
      },
    ],
  ]);
};

// --- Tests ---

describe('useWatchlistToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetQueriesData.mockReturnValue([]);
  });

  it('isInWatchlist関数を返す', () => {
    const { result } = renderHook(() => useWatchlistToggle());

    expect(typeof result.current.isInWatchlist).toBe('function');
  });

  it('キャッシュにない映画はisInWatchlistがfalseを返す', () => {
    const { result } = renderHook(() => useWatchlistToggle());

    expect(result.current.isInWatchlist(42)).toBe(false);
  });

  it('キャッシュにある映画はisInWatchlistがtrueを返す', () => {
    setupCacheWithItem(42, 'watchlist-id-123');
    const { result } = renderHook(() => useWatchlistToggle());

    expect(result.current.isInWatchlist(42)).toBe(true);
  });

  it('ウォッチリストにない映画のトグルでaddWatchlistが呼ばれる', () => {
    const { result } = renderHook(() => useWatchlistToggle());

    act(() => {
      result.current.toggleWatchlist(createMovie());
    });

    expect(mockAddWatchlist).toHaveBeenCalledWith({
      tmdb_movie_id: 42,
      title: 'テスト映画',
      poster_path: '/poster.jpg',
      release_date: '2026-01-01',
    });
    expect(mockToast).toHaveBeenCalledWith({
      title: WATCHLIST_SUCCESS_MESSAGES.ADDED,
      variant: 'success',
    });
  });

  it('ウォッチリストにある映画のトグルでremoveWatchlistが呼ばれる', () => {
    setupCacheWithItem(42, 'watchlist-id-123');
    const { result } = renderHook(() => useWatchlistToggle());

    act(() => {
      result.current.toggleWatchlist(createMovie());
    });

    expect(mockRemoveWatchlist).toHaveBeenCalledWith('watchlist-id-123');
    expect(mockToast).toHaveBeenCalledWith({
      title: WATCHLIST_SUCCESS_MESSAGES.REMOVED,
      variant: 'success',
    });
  });

  it('isTogglingがfalseを返す（mutation非実行時）', () => {
    const { result } = renderHook(() => useWatchlistToggle());

    expect(result.current.isToggling).toBe(false);
  });
});
