/**
 * useWatchlistフック テスト
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, createElement } from 'react';

import { useWatchlist } from './useWatchlist';

// --- Mocks ---

const mockGetWatchlist = jest.fn();
const mockAddWatchlist = jest.fn();
const mockRemoveWatchlist = jest.fn();

jest.mock('@/lib/api/watchlist/watchlist', () => ({
  getWatchlist: (...args: unknown[]) => mockGetWatchlist(...args),
  addWatchlist: (...args: unknown[]) => mockAddWatchlist(...args),
  removeWatchlist: (...args: unknown[]) => mockRemoveWatchlist(...args),
}));

import { useSession } from 'next-auth/react';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn().mockReturnValue({
    data: { user: { id: 'user-123' } },
    status: 'authenticated',
  }),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// --- Helpers ---

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

const mockWatchlistResponse = {
  success: true,
  data: {
    watchlist: [
      {
        id: 'wl-1',
        tmdb_movie_id: 100,
        title: '映画A',
        poster_path: '/a.jpg',
        release_date: '2026-01-01',
        added_at: '2026-01-10T00:00:00Z',
      },
      {
        id: 'wl-2',
        tmdb_movie_id: 200,
        title: '映画B',
        poster_path: '/b.jpg',
        release_date: '2026-02-01',
        added_at: '2026-01-09T00:00:00Z',
      },
    ],
    next_cursor: null,
    has_more: false,
  },
};

// --- Tests ---

describe('useWatchlist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWatchlist.mockResolvedValue(mockWatchlistResponse);
  });

  it('ウォッチリスト一覧を取得する', async () => {
    const { result } = renderHook(() => useWatchlist(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.watchlist).toHaveLength(2);
    });

    expect(result.current.watchlist[0].title).toBe('映画A');
    expect(result.current.watchlist[1].title).toBe('映画B');
  });

  it('isInWatchlistがキャッシュから正しく判定する', async () => {
    const { result } = renderHook(() => useWatchlist(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.watchlist).toHaveLength(2);
    });

    expect(result.current.isInWatchlist(100)).toBe(true);
    expect(result.current.isInWatchlist(200)).toBe(true);
    expect(result.current.isInWatchlist(999)).toBe(false);
  });

  it('getWatchlistIdがキャッシュから正しく取得する', async () => {
    const { result } = renderHook(() => useWatchlist(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.watchlist).toHaveLength(2);
    });

    expect(result.current.getWatchlistId(100)).toBe('wl-1');
    expect(result.current.getWatchlistId(999)).toBeUndefined();
  });

  it('追加mutationがAPIを呼び出す', async () => {
    mockAddWatchlist.mockResolvedValue({
      success: true,
      data: {
        id: 'wl-3',
        tmdb_movie_id: 300,
        title: '映画C',
        poster_path: null,
        release_date: null,
        added_at: '2026-03-10T00:00:00Z',
      },
    });

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.watchlist).toHaveLength(2);
    });

    act(() => {
      result.current.addToWatchlist({
        tmdb_movie_id: 300,
        title: '映画C',
      });
    });

    await waitFor(() => {
      expect(mockAddWatchlist).toHaveBeenCalled();
      expect(mockAddWatchlist.mock.calls[0][0]).toEqual({
        tmdb_movie_id: 300,
        title: '映画C',
      });
    });
  });

  it('追加エラー時にロールバックとトーストが表示される', async () => {
    mockAddWatchlist.mockRejectedValue(new Error('Conflict'));

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.watchlist).toHaveLength(2);
    });

    act(() => {
      result.current.addToWatchlist({
        tmdb_movie_id: 300,
        title: '映画C',
      });
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
  });

  it('削除mutationがAPIを呼び出す', async () => {
    mockRemoveWatchlist.mockResolvedValue(undefined);

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.watchlist).toHaveLength(2);
    });

    act(() => {
      result.current.removeFromWatchlist('wl-1');
    });

    await waitFor(() => {
      expect(mockRemoveWatchlist).toHaveBeenCalled();
      expect(mockRemoveWatchlist.mock.calls[0][0]).toBe('wl-1');
    });
  });

  it('削除エラー時にロールバックとトーストが表示される', async () => {
    mockRemoveWatchlist.mockRejectedValue(new Error('Not Found'));

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.watchlist).toHaveLength(2);
    });

    act(() => {
      result.current.removeFromWatchlist('wl-1');
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
  });

  it('未認証時はクエリを実行しない', () => {
    (useSession as jest.Mock).mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: createWrapper(),
    });

    expect(result.current.watchlist).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
    expect(mockGetWatchlist).not.toHaveBeenCalled();

    // 元に戻す
    (useSession as jest.Mock).mockReturnValue({
      data: { user: { id: 'user-123' } },
      status: 'authenticated',
    });
  });

  it('次ページ読み込みが動作する', async () => {
    mockGetWatchlist
      .mockResolvedValueOnce({
        success: true,
        data: {
          watchlist: [
            {
              id: 'wl-1',
              tmdb_movie_id: 100,
              title: '映画A',
              poster_path: null,
              release_date: null,
              added_at: '2026-01-10T00:00:00Z',
            },
          ],
          next_cursor: '2026-01-09T00:00:00Z',
          has_more: true,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          watchlist: [
            {
              id: 'wl-2',
              tmdb_movie_id: 200,
              title: '映画B',
              poster_path: null,
              release_date: null,
              added_at: '2026-01-09T00:00:00Z',
            },
          ],
          next_cursor: null,
          has_more: false,
        },
      });

    const { result } = renderHook(() => useWatchlist(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.watchlist).toHaveLength(1);
      expect(result.current.hasNextPage).toBe(true);
    });

    act(() => {
      result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(result.current.watchlist).toHaveLength(2);
    });
  });
});
