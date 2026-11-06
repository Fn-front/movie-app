/**
 * useWatchlistフック テスト
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, createElement } from 'react';

import { ANALYTICS_EVENTS } from '@/constants/analytics';

import { useWatchlist } from './useWatchlist';

// --- Mocks ---

const mockGetWatchlist = jest.fn();
const mockAddWatchlist = jest.fn();
const mockRemoveWatchlist = jest.fn();
const mockUpdateWatched = jest.fn();

jest.mock('@/lib/api/watchlist/watchlist', () => ({
  getWatchlist: (...args: unknown[]) => mockGetWatchlist(...args),
  addWatchlist: (...args: unknown[]) => mockAddWatchlist(...args),
  removeWatchlist: (...args: unknown[]) => mockRemoveWatchlist(...args),
  updateWatched: (...args: unknown[]) => mockUpdateWatched(...args),
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
        watched_at: null,
      },
      {
        id: 'wl-2',
        tmdb_movie_id: 200,
        title: '映画B',
        poster_path: '/b.jpg',
        release_date: '2026-02-01',
        added_at: '2026-01-09T00:00:00Z',
        watched_at: null,
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

  describe('視聴済みの付け外し', () => {
    it('視聴済みにするとAPIを呼び出す', async () => {
      mockUpdateWatched.mockResolvedValue({
        success: true,
        data: {
          id: 'wl-1',
          tmdb_movie_id: 100,
          title: '映画A',
          poster_path: '/a.jpg',
          release_date: '2026-01-01',
          added_at: '2026-01-10T00:00:00Z',
          watched_at: '2026-03-01T00:00:00Z',
        },
      });

      const { result } = renderHook(() => useWatchlist(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.watchlist).toHaveLength(2);
      });

      act(() => {
        result.current.setWatched('wl-1', true);
      });

      // React Query v5 は mutationFn に第2引数（コンテキスト）を渡すため、
      // 第1引数だけを見る
      await waitFor(() => {
        expect(mockUpdateWatched.mock.calls[0]?.[0]).toEqual({
          id: 'wl-1',
          watched: true,
        });
      });
    });

    it('未視聴に戻すときもAPIを呼び出す', async () => {
      mockUpdateWatched.mockResolvedValue({ success: true, data: {} });

      const { result } = renderHook(() => useWatchlist(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.watchlist).toHaveLength(2);
      });

      act(() => {
        result.current.setWatched('wl-1', false);
      });

      await waitFor(() => {
        expect(mockUpdateWatched.mock.calls[0]?.[0]).toEqual({
          id: 'wl-1',
          watched: false,
        });
      });
    });

    it('楽観的に視聴済みへ反映する', async () => {
      // 解決しないPromiseにして、楽観更新だけを見る
      mockUpdateWatched.mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useWatchlist(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.watchlist).toHaveLength(2);
      });

      act(() => {
        result.current.setWatched('wl-1', true);
      });

      await waitFor(() => {
        const item = result.current.watchlist.find((i) => i.id === 'wl-1');
        expect(item?.watched_at).not.toBeNull();
      });
    });

    it('エラー時にロールバックしてトーストを出す', async () => {
      mockUpdateWatched.mockRejectedValue(new Error('API Error'));

      const { result } = renderHook(() => useWatchlist(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.watchlist).toHaveLength(2);
      });

      act(() => {
        result.current.setWatched('wl-1', true);
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'error' }),
        );
      });

      const item = result.current.watchlist.find((i) => i.id === 'wl-1');
      expect(item?.watched_at).toBeNull();
    });

    it('更新中はisUpdatingWatchedがtrueになる', async () => {
      mockUpdateWatched.mockReturnValue(new Promise(() => {}));

      const { result } = renderHook(() => useWatchlist(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.watchlist).toHaveLength(2);
      });

      expect(result.current.isUpdatingWatched).toBe(false);

      act(() => {
        result.current.setWatched('wl-1', true);
      });

      await waitFor(() => {
        expect(result.current.isUpdatingWatched).toBe(true);
      });
    });
  });

  /**
   * 一覧ページとサイドバーの削除はこの経路を通る。useWatchlistToggle
   * （詳細モーダル）だけに計測を置くと、追加は全経路・削除は詳細モーダル
   * のみとなり、追加/削除比が構造的に歪む（#938）
   */
  describe('GA4 計測', () => {
    const gtag = jest.fn();

    beforeEach(() => {
      window.gtag = gtag;
      mockRemoveWatchlist.mockResolvedValue(undefined);
    });

    afterEach(() => {
      delete window.gtag;
    });

    it('削除で watchlist_remove を作品IDに引き直して送る', async () => {
      // 引数は watchlist の行ID（wl-1）だが、送るのは作品ID（100）
      const { result } = renderHook(() => useWatchlist(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.watchlist).toHaveLength(2);
      });

      act(() => {
        result.current.removeFromWatchlist('wl-1');
      });

      expect(gtag).toHaveBeenCalledWith(
        'event',
        ANALYTICS_EVENTS.WATCHLIST_REMOVE,
        { movie_id: 100 },
      );
    });

    it('作品タイトルを送らない', async () => {
      const { result } = renderHook(() => useWatchlist(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.watchlist).toHaveLength(2);
      });

      act(() => {
        result.current.removeFromWatchlist('wl-1');
      });

      expect(JSON.stringify(gtag.mock.calls)).not.toContain('映画A');
    });

    it('一覧に無いIDでは送らない（作品IDを引けないため）', async () => {
      const { result } = renderHook(() => useWatchlist(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.watchlist).toHaveLength(2);
      });

      act(() => {
        result.current.removeFromWatchlist('wl-unknown');
      });

      expect(gtag).not.toHaveBeenCalled();
      // 削除そのものは実行する（計測の都合で操作を止めない）
      await waitFor(() => {
        expect(mockRemoveWatchlist).toHaveBeenCalled();
      });
      expect(mockRemoveWatchlist.mock.calls[0][0]).toBe('wl-unknown');
    });

    it('削除に失敗しても watchlist_remove は送られたまま（試行数を数える）', async () => {
      // 操作時点で送る設計の帰結。「削除された数」ではなく
      // 「削除を試みた数」になることを明示して固定する（#938）
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

      // ロールバックまで進めてからでも消えない
      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'error' }),
        );
      });
      expect(gtag).toHaveBeenCalledWith(
        'event',
        ANALYTICS_EVENTS.WATCHLIST_REMOVE,
        { movie_id: 100 },
      );
    });
  });
});
