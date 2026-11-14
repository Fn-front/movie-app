/**
 * useWatchlistLookupフック テスト
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, createElement } from 'react';

import { useWatchlistLookup } from './useWatchlistLookup';

// --- Mocks ---

const mockGetWatchlistLookup = jest.fn();

jest.mock('@/lib/api/watchlist/watchlist', () => ({
  getWatchlistLookup: (...args: unknown[]) => mockGetWatchlistLookup(...args),
}));

import { useSession } from 'next-auth/react';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

// --- Helpers ---

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

/** 指定件数のウォッチリストを作る（tmdb_movie_id は 1001 から連番） */
const createLookupResponse = (count: number) => ({
  success: true,
  data: {
    watchlist: Array.from({ length: count }, (_, i) => ({
      id: `wl-${i + 1}`,
      tmdb_movie_id: 1001 + i,
    })),
  },
});

// --- Tests ---

describe('useWatchlistLookup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useSession as jest.Mock).mockReturnValue({
      data: { user: { id: 'user-123' } },
      status: 'authenticated',
    });
    mockGetWatchlistLookup.mockResolvedValue(createLookupResponse(1));
  });

  it('登録済みの映画はウォッチリストIDを返す', async () => {
    const { result } = renderHook(() => useWatchlistLookup(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.getLookupWatchlistId(1001)).toBe('wl-1');
    });
  });

  /**
   * 「まだ分からない」と「登録されていない」を区別する（#1145）
   *
   * `getLookupWatchlistId` はどちらでも undefined を返すため、呼び出し側は
   * 取得前の作品をすべて「未登録（＋）」として描いてしまう
   */
  describe('登録状況が確定したか', () => {
    it('セッション判定中は未確定', () => {
      (useSession as jest.Mock).mockReturnValue({
        data: null,
        status: 'loading',
      });

      const { result } = renderHook(() => useWatchlistLookup(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isResolving).toBe(true);
    });

    it('取得が終わるまでは未確定', async () => {
      const { result } = renderHook(() => useWatchlistLookup(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isResolving).toBe(true);
      await waitFor(() => expect(result.current.isResolving).toBe(false));
    });

    it('未認証なら確定（全件が未登録で正しい）', () => {
      (useSession as jest.Mock).mockReturnValue({
        data: null,
        status: 'unauthenticated',
      });

      const { result } = renderHook(() => useWatchlistLookup(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isResolving).toBe(false);
    });

    it('取得に失敗しても確定として扱う（全件を未登録にする既存方針）', async () => {
      mockGetWatchlistLookup.mockRejectedValue(new Error('boom'));

      const { result } = renderHook(() => useWatchlistLookup(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isResolving).toBe(false));
      expect(result.current.getLookupWatchlistId(1001)).toBeUndefined();
    });
  });

  it('未登録の映画は undefined を返す', async () => {
    const { result } = renderHook(() => useWatchlistLookup(), {
      wrapper: createWrapper(),
    });

    // 読み込み前も undefined なので、取得が反映されたことを確かめてから判定する
    await waitFor(() => {
      expect(result.current.getLookupWatchlistId(1001)).toBeDefined();
    });

    expect(result.current.getLookupWatchlistId(9999)).toBeUndefined();
  });

  /**
   * ⚠️ **本件の核心**（#1145）。
   *
   * 判定材料を埋めていたサイドバーのパネルは `limit: 10` で読むため、
   * 11件目以降が「未登録」になり「＋」のまま表示されていた。
   * 押すと楽観的な成功トーストの直後に 409 のエラートーストが重なる
   */
  it('11件目以降のウォッチリストもヒットする', async () => {
    mockGetWatchlistLookup.mockResolvedValue(createLookupResponse(25));

    const { result } = renderHook(() => useWatchlistLookup(), {
      wrapper: createWrapper(),
    });

    // 11件目（index 10）と最後の25件目
    await waitFor(() => {
      expect(result.current.getLookupWatchlistId(1011)).toBe('wl-11');
    });
    expect(result.current.getLookupWatchlistId(1025)).toBe('wl-25');
  });

  it('ウォッチリスト0件なら全作品が未登録になる', async () => {
    mockGetWatchlistLookup.mockResolvedValue(createLookupResponse(0));

    const { result } = renderHook(() => useWatchlistLookup(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockGetWatchlistLookup).toHaveBeenCalled();
    });

    expect(result.current.getLookupWatchlistId(1001)).toBeUndefined();
  });

  // 判定が取れないだけで画面が見られなくなる方が困るため、未登録扱いに倒す
  it('取得に失敗しても未登録扱いで返る', async () => {
    mockGetWatchlistLookup.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() => useWatchlistLookup(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockGetWatchlistLookup).toHaveBeenCalled();
    });

    // 例外が投げられず、全作品が未登録として扱われる
    expect(result.current.getLookupWatchlistId(1001)).toBeUndefined();
  });

  it('未認証ではウォッチリストを問い合わせない', () => {
    (useSession as jest.Mock).mockReturnValue({
      data: null,
      status: 'unauthenticated',
    });

    const { result } = renderHook(() => useWatchlistLookup(), {
      wrapper: createWrapper(),
    });

    expect(mockGetWatchlistLookup).not.toHaveBeenCalled();
    expect(result.current.getLookupWatchlistId(1001)).toBeUndefined();
  });

  // 無効化済みセッションは user が空文字で埋まったオブジェクトとして返る
  it('セッションの user.id が無ければ問い合わせない', () => {
    (useSession as jest.Mock).mockReturnValue({
      data: { user: { id: '' } },
      status: 'authenticated',
    });

    renderHook(() => useWatchlistLookup(), { wrapper: createWrapper() });

    expect(mockGetWatchlistLookup).not.toHaveBeenCalled();
  });
});
