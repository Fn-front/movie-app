/**
 * useWatchlistToggle カスタムフック テスト
 */

import { renderHook, act } from '@testing-library/react';

import { ANALYTICS_EVENTS } from '@/constants/analytics';
import { WATCHLIST_SUCCESS_MESSAGES } from '@/constants/watchlist';

import { useWatchlistToggle } from './useWatchlistToggle';

// --- Mocks ---

const mockToast = jest.fn();
const mockAddWatchlist = jest.fn().mockResolvedValue({});
const mockRemoveWatchlist = jest.fn().mockResolvedValue(undefined);
const mockInvalidateQueries = jest.fn();
const mockCancelQueries = jest.fn().mockResolvedValue(undefined);
const mockGetQueriesData = jest.fn().mockReturnValue([]);
const mockSetQueryData = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueriesData: mockGetQueriesData,
    invalidateQueries: mockInvalidateQueries,
    cancelQueries: mockCancelQueries,
    setQueryData: mockSetQueryData,
  }),
  useMutation: ({
    mutationFn,
  }: {
    mutationFn: (...args: unknown[]) => Promise<unknown>;
  }) => ({
    mutate: mutationFn,
    isPending: false,
  }),
}));

const mockOpenLoginPrompt = jest.fn();

jest.mock('@/lib/store/useLoginPromptStore', () => ({
  useLoginPromptStore: (selector: (s: { open: jest.Mock }) => jest.Mock) =>
    selector({ open: mockOpenLoginPrompt }),
}));

const mockUseSession = jest.fn();

jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
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
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      status: 'authenticated',
    });
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

  it('未認証時のtoggleWatchlistでログイン誘導モーダルが表示される', () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });
    const { result } = renderHook(() => useWatchlistToggle());

    act(() => {
      result.current.toggleWatchlist(createMovie());
    });

    expect(mockOpenLoginPrompt).toHaveBeenCalledWith(
      'ウォッチリストに追加するにはログインが必要です。',
    );
    expect(mockAddWatchlist).not.toHaveBeenCalled();
  });

  /**
   * sendEvent はモックせず window.gtag を差し替える。
   * 実際に gtag へ渡る引数まで見ないと「余計な値を送っていないこと」を
   * 保証できないため（#938）
   */
  describe('GA4 計測', () => {
    const gtag = jest.fn();

    beforeEach(() => {
      window.gtag = gtag;
    });

    afterEach(() => {
      delete window.gtag;
    });

    it('追加で watchlist_add を作品IDだけ付けて送る', () => {
      const { result } = renderHook(() => useWatchlistToggle());

      act(() => {
        result.current.toggleWatchlist(createMovie());
      });

      expect(gtag).toHaveBeenCalledWith(
        'event',
        ANALYTICS_EVENTS.WATCHLIST_ADD,
        {
          movie_id: 42,
        },
      );
    });

    it('削除で watchlist_remove を作品IDだけ付けて送る', () => {
      setupCacheWithItem(42, 'watchlist-id-123');
      const { result } = renderHook(() => useWatchlistToggle());

      act(() => {
        result.current.toggleWatchlist(createMovie());
      });

      expect(gtag).toHaveBeenCalledWith(
        'event',
        ANALYTICS_EVENTS.WATCHLIST_REMOVE,
        { movie_id: 42 },
      );
    });

    it('作品タイトルを送らない', () => {
      const { result } = renderHook(() => useWatchlistToggle());

      act(() => {
        result.current.toggleWatchlist(createMovie());
      });

      expect(JSON.stringify(gtag.mock.calls)).not.toContain('テスト映画');
    });

    it('未認証なら送らない（操作自体が成立しないため）', () => {
      mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });
      const { result } = renderHook(() => useWatchlistToggle());

      act(() => {
        result.current.toggleWatchlist(createMovie());
      });

      expect(gtag).not.toHaveBeenCalled();
    });

    it('gtag が無くても操作は成立する', () => {
      delete window.gtag;
      const { result } = renderHook(() => useWatchlistToggle());

      expect(() => {
        act(() => {
          result.current.toggleWatchlist(createMovie());
        });
      }).not.toThrow();
      expect(mockAddWatchlist).toHaveBeenCalled();
    });
  });
});
