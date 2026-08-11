/**
 * useWatchlistPage カスタムフック テスト
 */

import { renderHook, act } from '@testing-library/react';

import { useWatchlistPage } from './useWatchlistPage';

// --- Mocks ---

const mockUseWatchlist = jest.fn().mockReturnValue({
  watchlist: [],
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
});

jest.mock('@/features/watchlist/hooks/useWatchlist', () => ({
  useWatchlist: (...args: unknown[]) => mockUseWatchlist(...args),
}));

// --- Tests ---

describe('useWatchlistPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('初期状態でsortByがadded_atになる', () => {
    const { result } = renderHook(() => useWatchlistPage());

    expect(result.current.sortBy).toBe('added_at');
    expect(mockUseWatchlist).toHaveBeenCalledWith({ sort: 'added_at' });
  });

  it('handleSortChangeでsortByが変更される', () => {
    const { result } = renderHook(() => useWatchlistPage());

    act(() => {
      result.current.handleSortChange('release_date_proximity');
    });

    expect(result.current.sortBy).toBe('release_date_proximity');
    expect(mockUseWatchlist).toHaveBeenCalledWith({
      sort: 'release_date_proximity',
    });
  });

  it('境界値: 一度切替後に元のソート (added_at) に戻せる', () => {
    const { result } = renderHook(() => useWatchlistPage());

    act(() => {
      result.current.handleSortChange('release_date_proximity');
    });
    expect(result.current.sortBy).toBe('release_date_proximity');

    act(() => {
      result.current.handleSortChange('added_at');
    });
    expect(result.current.sortBy).toBe('added_at');
    // 最後の呼び出しは added_at で行われる
    expect(mockUseWatchlist).toHaveBeenLastCalledWith({ sort: 'added_at' });
  });

  it('useWatchlistの返り値が正しく返される', () => {
    const mockWatchlist = [
      {
        id: 'wl-1',
        tmdb_movie_id: 100,
        title: '映画1',
        poster_path: null,
        release_date: null,
        added_at: '2026-01-01T00:00:00Z',
      },
    ];
    mockUseWatchlist.mockReturnValue({
      watchlist: mockWatchlist,
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: true,
      fetchNextPage: jest.fn(),
      removeFromWatchlist: jest.fn(),
      addToWatchlist: jest.fn(),
      isInWatchlist: jest.fn(),
      getWatchlistId: jest.fn(),
      isAdding: false,
      isRemoving: false,
    });

    const { result } = renderHook(() => useWatchlistPage());

    expect(result.current.watchlist).toEqual(mockWatchlist);
    expect(result.current.hasNextPage).toBe(true);
  });
});
