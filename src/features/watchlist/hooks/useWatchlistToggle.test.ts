/**
 * useWatchlistToggle カスタムフック テスト
 */

import { renderHook, act } from '@testing-library/react';

import { WATCHLIST_SUCCESS_MESSAGES } from '@/constants/watchlist';

import { useWatchlistToggle } from './useWatchlistToggle';

// --- Mocks ---

const mockIsInWatchlist = jest.fn().mockReturnValue(false);
const mockGetWatchlistId = jest.fn().mockReturnValue(undefined);
const mockAddToWatchlist = jest.fn();
const mockRemoveFromWatchlist = jest.fn();
const mockToast = jest.fn();

let mockIsAdding = false;
let mockIsRemoving = false;

jest.mock('@/features/watchlist/hooks/useWatchlist', () => ({
  useWatchlist: () => ({
    isInWatchlist: mockIsInWatchlist,
    getWatchlistId: mockGetWatchlistId,
    addToWatchlist: mockAddToWatchlist,
    removeFromWatchlist: mockRemoveFromWatchlist,
    get isAdding() {
      return mockIsAdding;
    },
    get isRemoving() {
      return mockIsRemoving;
    },
    watchlist: [],
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
  }),
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

// --- Tests ---

describe('useWatchlistToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAdding = false;
    mockIsRemoving = false;
  });

  it('isInWatchlist関数を返す', () => {
    const { result } = renderHook(() => useWatchlistToggle());

    expect(result.current.isInWatchlist).toBe(mockIsInWatchlist);
  });

  it('ウォッチリストにない映画のトグルでaddToWatchlistが呼ばれる', () => {
    mockIsInWatchlist.mockReturnValue(false);
    const { result } = renderHook(() => useWatchlistToggle());

    act(() => {
      result.current.toggleWatchlist(createMovie());
    });

    expect(mockAddToWatchlist).toHaveBeenCalledWith({
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

  it('ウォッチリストにある映画のトグルでremoveFromWatchlistが呼ばれる', () => {
    mockIsInWatchlist.mockReturnValue(true);
    mockGetWatchlistId.mockReturnValue('watchlist-id-123');
    const { result } = renderHook(() => useWatchlistToggle());

    act(() => {
      result.current.toggleWatchlist(createMovie());
    });

    expect(mockRemoveFromWatchlist).toHaveBeenCalledWith('watchlist-id-123');
    expect(mockToast).toHaveBeenCalledWith({
      title: WATCHLIST_SUCCESS_MESSAGES.REMOVED,
      variant: 'success',
    });
  });

  it('watchlistIdがnullの場合removeFromWatchlistが呼ばれない', () => {
    mockIsInWatchlist.mockReturnValue(true);
    mockGetWatchlistId.mockReturnValue(undefined);
    const { result } = renderHook(() => useWatchlistToggle());

    act(() => {
      result.current.toggleWatchlist(createMovie());
    });

    expect(mockRemoveFromWatchlist).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('isTogglingがfalseを返す（isAdding=false, isRemoving=false）', () => {
    const { result } = renderHook(() => useWatchlistToggle());

    expect(result.current.isToggling).toBe(false);
  });

  it('isAdding=trueの場合isTogglingがtrueを返す', () => {
    mockIsAdding = true;
    const { result } = renderHook(() => useWatchlistToggle());

    expect(result.current.isToggling).toBe(true);
  });

  it('isRemoving=trueの場合isTogglingがtrueを返す', () => {
    mockIsRemoving = true;
    const { result } = renderHook(() => useWatchlistToggle());

    expect(result.current.isToggling).toBe(true);
  });

  it('isAdding=trueかつtogglingIdsに含まれている場合isMovieTogglingがtrueを返す', () => {
    mockIsAdding = true;
    mockIsInWatchlist.mockReturnValue(false);
    const { result } = renderHook(() => useWatchlistToggle());

    act(() => {
      result.current.toggleWatchlist(createMovie());
    });

    expect(result.current.isMovieToggling(42)).toBe(true);
  });

  it('isRemoving=trueかつtogglingIdsに含まれている場合isMovieTogglingがtrueを返す', () => {
    mockIsRemoving = true;
    mockIsInWatchlist.mockReturnValue(true);
    mockGetWatchlistId.mockReturnValue('wl-1');
    const { result } = renderHook(() => useWatchlistToggle());

    act(() => {
      result.current.toggleWatchlist(createMovie());
    });

    expect(result.current.isMovieToggling(42)).toBe(true);
  });

  it('togglingIdsに含まれていない映画はisMovieTogglingがfalseを返す', () => {
    mockIsAdding = true;
    const { result } = renderHook(() => useWatchlistToggle());

    act(() => {
      result.current.toggleWatchlist(createMovie());
    });

    expect(result.current.isMovieToggling(999)).toBe(false);
  });
});
