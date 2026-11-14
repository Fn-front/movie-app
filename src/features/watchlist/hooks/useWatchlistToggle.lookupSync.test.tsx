/**
 * useWatchlistToggle × 照会キャッシュの同期テスト（#1145）
 *
 * `useWatchlistToggle.test.ts` とは別ファイルにする。あちらは
 * `jest.mock('@tanstack/react-query')` でキャッシュを手書きのフェイクに
 * 置き換え、さらに `useWatchlistLookup` ごとモックしているため、
 * **照会キャッシュの鮮度が絡む経路を構造的に再現できない**。
 *
 * ここでは本物の QueryClient と本物の `useWatchlistLookup` を使う。
 *
 * ⚠️ 再取得（invalidate 後の fetch）を**わざと解決させない**のが肝。
 * 測りたいのは「mutation が settle してから再取得が届くまでの窓」で、
 * すぐ解決させるとその窓を飛び越えて観測できない。
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, createElement } from 'react';

import { useWatchlistToggle } from './useWatchlistToggle';

const MOVIE_ID = 42;
const ROW_ID = 'wl-row-1';

const MOVIE = {
  id: MOVIE_ID,
  title: 'テスト映画',
  poster_path: null,
  release_date: '2026-01-01',
} as const;

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1' } },
    status: 'authenticated',
  }),
}));

jest.mock('@/hooks/useToast', () => ({
  useToastDispatch: () => ({
    toast: jest.fn(),
    removeToast: jest.fn(),
    clearToasts: jest.fn(),
  }),
}));

jest.mock('@/lib/store/useLoginPromptStore', () => ({
  useLoginPromptStore: (selector: (s: { open: jest.Mock }) => jest.Mock) =>
    selector({ open: jest.fn() }),
}));

const mockAddWatchlist = jest.fn();
const mockRemoveWatchlist = jest.fn().mockResolvedValue(undefined);
const mockGetWatchlistLookup = jest.fn();

jest.mock('@/lib/api/watchlist/watchlist', () => ({
  addWatchlist: (...args: unknown[]) => mockAddWatchlist(...args),
  removeWatchlist: (...args: unknown[]) => mockRemoveWatchlist(...args),
  getWatchlistLookup: (...args: unknown[]) => mockGetWatchlistLookup(...args),
}));

/**
 * 初回だけ `initial` を返し、以降の再取得は解決しないままにする
 */
const setupLookup = (initial: { id: string; tmdb_movie_id: number }[]) => {
  let calls = 0;
  mockGetWatchlistLookup.mockImplementation(() => {
    calls += 1;
    if (calls === 1) {
      return Promise.resolve({
        success: true,
        data: { watchlist: initial },
      });
    }
    return new Promise(() => {});
  });
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

const renderToggle = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useWatchlistToggle(), {
    wrapper: createWrapper(queryClient),
  });
};

describe('useWatchlistToggle と照会キャッシュの同期', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemoveWatchlist.mockResolvedValue(undefined);
  });

  /**
   * ⚠️ **#1145 の修正が作りかけた鏡像の不具合**。
   *
   * 判定は照会を先に見るのに、照会は一覧と別キーなので
   * `optimisticRemoveFromAllCaches` では追従しない。削除が完了して
   * `onSettled` が楽観状態（`removes`）を解除した瞬間、まだ古い照会が
   * ヒットして「✓（登録済み）」へ戻っていた。
   *
   * その窓で押すと論理削除済みの行へ DELETE が飛び、`softDeleteById` が
   * `deleted_at IS NULL` で絞るため 404 ＝ エラートーストになる。
   */
  it('削除が完了した直後に「登録済み」へ戻らない', async () => {
    setupLookup([{ id: ROW_ID, tmdb_movie_id: MOVIE_ID }]);
    const { result } = renderToggle();

    await waitFor(() => {
      expect(result.current.isInWatchlist(MOVIE_ID)).toBe(true);
    });

    await act(async () => {
      result.current.toggleWatchlist(MOVIE);
    });

    expect(mockRemoveWatchlist).toHaveBeenCalledWith(ROW_ID);
    // 再取得はまだ届いていない。それでも未登録として描けていること
    expect(result.current.isInWatchlist(MOVIE_ID)).toBe(false);
  });

  /**
   * 追加直後に削除を押したとき、仮ID（`optimistic-...`）で DELETE しない。
   *
   * 照会キャッシュには追加時に仮IDを積むので、`onSuccess` で実IDへ
   * 差し替えないと、再取得が届く前の削除が 400 になる
   */
  it('追加直後の削除で仮IDを使わない', async () => {
    setupLookup([]);
    mockAddWatchlist.mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        id: ROW_ID,
        tmdb_movie_id: MOVIE_ID,
        title: MOVIE.title,
        poster_path: null,
        release_date: MOVIE.release_date,
        added_at: '2026-01-01T00:00:00Z',
        watched_at: null,
        streaming: null,
      },
    });

    const { result } = renderToggle();
    await waitFor(() => {
      expect(result.current.isWatchlistResolving).toBe(false);
    });

    await act(async () => {
      result.current.toggleWatchlist(MOVIE);
    });
    expect(mockAddWatchlist).toHaveBeenCalled();

    await act(async () => {
      result.current.toggleWatchlist(MOVIE);
    });

    expect(mockRemoveWatchlist).toHaveBeenCalledWith(ROW_ID);
    expect(mockRemoveWatchlist).not.toHaveBeenCalledWith(
      expect.stringContaining('optimistic-'),
    );
  });

  /**
   * 追加に失敗したら照会キャッシュも元へ戻す。
   * 戻さないと、失敗したのに「✓」のまま残る
   */
  it('追加に失敗したら照会キャッシュを巻き戻す', async () => {
    setupLookup([]);
    mockAddWatchlist.mockRejectedValue(new Error('boom'));

    const { result } = renderToggle();
    await waitFor(() => {
      expect(result.current.isWatchlistResolving).toBe(false);
    });

    await act(async () => {
      result.current.toggleWatchlist(MOVIE);
    });

    expect(result.current.isInWatchlist(MOVIE_ID)).toBe(false);
  });

  /**
   * 削除に失敗したら照会キャッシュも元へ戻す。
   * 戻さないと、消えていないのに「＋」のまま残る
   */
  it('削除に失敗したら照会キャッシュを巻き戻す', async () => {
    setupLookup([{ id: ROW_ID, tmdb_movie_id: MOVIE_ID }]);
    mockRemoveWatchlist.mockRejectedValue(new Error('boom'));

    const { result } = renderToggle();
    await waitFor(() => {
      expect(result.current.isInWatchlist(MOVIE_ID)).toBe(true);
    });

    await act(async () => {
      result.current.toggleWatchlist(MOVIE);
    });

    expect(result.current.isInWatchlist(MOVIE_ID)).toBe(true);
  });
});
