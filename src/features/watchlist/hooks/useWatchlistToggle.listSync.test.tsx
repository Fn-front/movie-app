/**
 * useWatchlistToggle × 一覧キャッシュの同期テスト（#1152）
 *
 * `lookupSync` と分けてあるのは、**削除に使うIDの出どころが2つある**ため。
 *
 * | 削除の押し場所 | IDの出どころ |
 * |---|---|
 * | タイル・詳細モーダル（`toggleWatchlist`） | 照会キャッシュ（`watchlistKeys.lookup`） |
 * | サイドバー（`useWatchlist.removeFromWatchlist`） | **一覧キャッシュの `item.id`** |
 *
 * `#1145` で照会側だけ実IDへ差し替えるようにしたが、一覧側は仮IDのまま
 * 残っていた。サイドバーの削除はそれをそのまま `DELETE /api/watchlist/:id`
 * に渡すので、再取得が届く前に押すと `isValidUuid` に弾かれて 400 になる。
 *
 * ⚠️ `useWatchlistToggle.test.ts` では再現できない。あちらは
 * `jest.mock('@tanstack/react-query')` でキャッシュを手書きのフェイクに
 * 置き換えているため、本物の `getQueriesData` / `setQueryData` を通らない。
 *
 * ⚠️ 再取得をわざと解決させないのが肝。測りたいのは「追加が成功してから
 * 再取得が届くまでの窓」で、すぐ解決させるとその窓を飛び越えてしまう。
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, createElement } from 'react';

import { watchlistKeys } from '@/constants/queryKeys';
import type { GetWatchlistResponse } from '@/lib/api/watchlist/watchlist';

import { useWatchlistToggle } from './useWatchlistToggle';

const MOVIE_ID = 42;
const ROW_ID = '11111111-2222-4333-8444-555555555555';

const MOVIE = {
  id: MOVIE_ID,
  title: 'テスト映画',
  poster_path: null,
  release_date: '2026-01-01',
} as const;

/** サイドバーが使っている一覧キャッシュのキー（`useWatchlist` の既定と同形） */
const LIST_KEY = watchlistKeys.list({
  sort: 'added_desc',
  excludeWatched: false,
  prioritizeStreaming: true,
});

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

/** 初回だけ空を返し、以降の再取得は解決しないままにする */
const setupLookup = () => {
  let calls = 0;
  mockGetWatchlistLookup.mockImplementation(() => {
    calls += 1;
    if (calls === 1) {
      return Promise.resolve({ success: true, data: { watchlist: [] } });
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

/**
 * 空の一覧キャッシュを積んだ状態で描画する
 *
 * `optimisticAddToAllCaches` は**既にあるクエリ**にしか書き込まないので、
 * 先に積んでおかないと一覧側の経路に入らない（＝何も検証できない）
 */
const renderToggleWithList = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  queryClient.setQueryData<{
    pages: GetWatchlistResponse[];
    pageParams: (string | undefined)[];
  }>(LIST_KEY, {
    pages: [
      {
        success: true,
        data: { watchlist: [], next_cursor: null, has_more: false },
      },
    ],
    pageParams: [undefined],
  });

  const view = renderHook(() => useWatchlistToggle(), {
    wrapper: createWrapper(queryClient),
  });

  return { ...view, queryClient };
};

/** 一覧キャッシュの先頭アイテムを取り出す */
const firstListItem = (queryClient: QueryClient) =>
  queryClient.getQueryData<{ pages: GetWatchlistResponse[] }>(LIST_KEY)
    ?.pages[0].data.watchlist[0];

describe('useWatchlistToggle と一覧キャッシュの同期', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRemoveWatchlist.mockResolvedValue(undefined);
    setupLookup();
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
  });

  /** 追加の押下から、再取得が届かないまま戻ってくるところまで */
  const addMovie = async () => {
    const view = renderToggleWithList();

    await waitFor(() => {
      expect(view.result.current.isWatchlistResolving).toBe(false);
    });

    await act(async () => {
      view.result.current.toggleWatchlist(MOVIE);
    });

    expect(mockAddWatchlist).toHaveBeenCalled();
    return view;
  };

  it('押した直後は楽観アイテムが一覧キャッシュに載る', async () => {
    // 楽観的UIそのものは維持する（押してから往復ぶん待たせない）
    const { queryClient } = await addMovie();

    expect(firstListItem(queryClient)?.tmdb_movie_id).toBe(MOVIE_ID);
  });

  /**
   * ⚠️ 本題。
   *
   * サイドバーの削除は一覧の `item.id` をそのまま DELETE へ渡す。
   * 仮IDのままだと `isValidUuid`（`api/watchlist/[id]/route.ts`）に弾かれて
   * 400 になり、赤いエラートーストが出る。
   */
  it('追加が成功したら一覧キャッシュのIDを実IDへ差し替える', async () => {
    const { queryClient } = await addMovie();

    expect(firstListItem(queryClient)?.id).toBe(ROW_ID);
  });

  it('一覧キャッシュに仮IDを残さない', async () => {
    const { queryClient } = await addMovie();

    expect(firstListItem(queryClient)?.id).not.toMatch(/^optimistic-/);
  });

  /**
   * 失敗したら巻き戻す（差し替えが巻き戻しを邪魔しないこと）
   *
   * 差し替えを `onSettled` に置くと、`onError` が戻したキャッシュへ
   * 後から楽観アイテムを書き戻してしまう
   */
  it('追加に失敗したら一覧キャッシュを巻き戻す', async () => {
    mockAddWatchlist.mockRejectedValue(new Error('boom'));

    const { queryClient } = await addMovie();

    expect(firstListItem(queryClient)).toBeUndefined();
  });
});
