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

/**
 * 本物の `useQueryClient` は同じインスタンスを返す。
 * 毎回別オブジェクトを返すと、クライアント単位で持つ状態が
 * インスタンス間で共有されず、実アプリと挙動が食い違う
 */
const makeQueryClient = () => ({
  getQueriesData: mockGetQueriesData,
  invalidateQueries: mockInvalidateQueries,
  cancelQueries: mockCancelQueries,
  setQueryData: mockSetQueryData,
  getQueryCache: () => mockQueryCache,
});

let mockQueryClient = makeQueryClient();

/**
 * キャッシュ購読を実際に検証できるようにする。
 *
 * no-op にすると「購読しているが再描画が起きない」種類の不具合を
 * 構造的に captures できない（実際に見逃した）
 */
const cacheListeners = new Set<() => void>();

const mockQueryCache = {
  subscribe: (listener: () => void) => {
    cacheListeners.add(listener);
    return () => cacheListeners.delete(listener);
  },
};

/** キャッシュの変化を模す */
const emitCacheEvent = (
  queryKey: readonly unknown[] = ['watchlist'],
  type = 'updated',
) => {
  for (const listener of [...cacheListeners]) {
    (listener as unknown as (event: unknown) => void)({
      type,
      query: { queryKey },
    });
  }
};

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
  /**
   * onMutate / onError / onSettled まで走らせる。
   *
   * mutationFn を呼ぶだけのモックだと、楽観状態の後始末（onSettled）が
   * 一度も実行されず、そこに入れたバグを誰も検出できない
   */
  useMutation: (options: {
    mutationFn: (variables: never) => Promise<unknown>;
    onMutate?: (variables: never) => Promise<unknown> | unknown;
    onError?: (error: unknown, variables: never, context: unknown) => void;
    onSettled?: (
      data: unknown,
      error: unknown,
      variables: never,
      context: unknown,
    ) => void;
  }) => ({
    mutate: async (variables: never) => {
      const context = await options.onMutate?.(variables);
      try {
        const data = await options.mutationFn(variables);
        options.onSettled?.(data, null, variables, context);
      } catch (error) {
        options.onError?.(error, variables, context);
        options.onSettled?.(undefined, error, variables, context);
      }
    },
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

/**
 * 照会フックはモックする（#1145）。
 *
 * 本物は `useQuery` を使うが、このファイルは `@tanstack/react-query` を
 * 丸ごと差し替えているため呼べない。照会そのものの挙動は
 * `useWatchlistLookup.test.ts` が見ているので、ここでは
 * 「照会が何を返したときトグル側がどう振る舞うか」だけを操作する
 */
const mockGetLookupWatchlistId = jest.fn<string | undefined, [number]>();
/** 変数名を `mock` で始めないと jest.mock のファクトリから参照できない */
let mockLookupResolving = false;

jest.mock('@/features/watchlist/hooks/useWatchlistLookup', () => ({
  useWatchlistLookup: () => ({
    getLookupWatchlistId: mockGetLookupWatchlistId,
    isResolving: mockLookupResolving,
  }),
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    toasts: [],
    toast: mockToast,
    removeToast: jest.fn(),
    clearToasts: jest.fn(),
  }),
  useToastDispatch: () => ({
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

const setupCacheWithItems = (
  items: { tmdbMovieId: number; watchlistId: string }[],
) => {
  mockGetQueriesData.mockReturnValue([
    [
      ['watchlist', 'list', { sort: 'release_date_proximity' }],
      {
        pages: [
          {
            data: {
              watchlist: items.map(({ tmdbMovieId, watchlistId }) => ({
                id: watchlistId,
                tmdb_movie_id: tmdbMovieId,
                title: 'テスト映画',
                poster_path: '/poster.jpg',
                release_date: '2026-01-01',
                added_at: '2026-01-01T00:00:00Z',
              })),
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
    // クライアント単位で持つ楽観状態をテスト間で持ち越さない
    mockQueryClient = makeQueryClient();
    cacheListeners.clear();
    mockGetQueriesData.mockReturnValue([]);
    mockGetLookupWatchlistId.mockReturnValue(undefined);
    mockLookupResolving = false;
    mockUseSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      status: 'authenticated',
    });
  });

  it('isInWatchlist関数を返す', () => {
    const { result } = renderHook(() => useWatchlistToggle());

    expect(typeof result.current.isInWatchlist).toBe('function');
  });

  /**
   * ⚠️ 以前は「キャッシュにない映画は false」を仕様として固定していたが、
   * **それがバグ本体だった**（#1145）。
   *
   * キャッシュを埋めるのはサイドバーのパネルで、公開日が近い未視聴の
   * 上位10件しか読まない。視聴済みにした作品と11件目以降はキャッシュに
   * 入らないため、登録済みでも「未登録」と判定されていた。
   * 今は照会（全件）を先に見るので、キャッシュの有無だけでは決まらない
   */
  it('照会にもキャッシュにも無ければisInWatchlistがfalseを返す', () => {
    const { result } = renderHook(() => useWatchlistToggle());

    expect(result.current.isInWatchlist(42)).toBe(false);
  });

  it('キャッシュにある映画はisInWatchlistがtrueを返す', () => {
    setupCacheWithItem(42, 'watchlist-id-123');
    const { result } = renderHook(() => useWatchlistToggle());

    expect(result.current.isInWatchlist(42)).toBe(true);
  });

  /**
   * 本件の回帰テスト（#1145）。
   *
   * 視聴済みの作品・11件目以降はサイドバーのキャッシュに載らない。
   * 照会から引けなければ「＋」のままになり、押すと成功トーストの直後に
   * 409 のエラートーストが重なる
   */
  describe('キャッシュに無い登録済みの作品（#1145）', () => {
    it('照会から引ければisInWatchlistがtrueを返す', () => {
      // キャッシュは空のまま＝サイドバーが読んでいない作品
      mockGetLookupWatchlistId.mockReturnValue('watchlist-id-999');

      const { result } = renderHook(() => useWatchlistToggle());

      expect(result.current.isInWatchlist(42)).toBe(true);
    });

    it('トグルすると追加ではなく削除になる', async () => {
      mockGetLookupWatchlistId.mockReturnValue('watchlist-id-999');

      const { result } = renderHook(() => useWatchlistToggle());

      await act(async () => {
        result.current.toggleWatchlist(createMovie());
      });

      // 登録済みと分かるので、409 になる追加リクエストは飛ばない
      expect(mockAddWatchlist).not.toHaveBeenCalled();
      expect(mockRemoveWatchlist).toHaveBeenCalledWith('watchlist-id-999');
    });

    it('照会のIDをキャッシュより優先する', async () => {
      // 同じ作品がキャッシュにも載っている場合、権威あるのは照会側
      setupCacheWithItem(42, 'stale-cache-id');
      mockGetLookupWatchlistId.mockReturnValue('lookup-id');

      const { result } = renderHook(() => useWatchlistToggle());

      await act(async () => {
        result.current.toggleWatchlist(createMovie());
      });

      expect(mockRemoveWatchlist).toHaveBeenCalledWith('lookup-id');
    });
  });

  /**
   * 登録済みかが未確定のうちは触らせない（#1145）。
   *
   * ここを通すと、登録済みの作品を「未登録」と誤判定して追加APIへ投げ、
   * 楽観的な成功トーストの直後に 409 のエラートーストが重なる
   */
  describe('照会が未確定のとき', () => {
    it('未確定であることを返す', () => {
      mockLookupResolving = true;

      const { result } = renderHook(() => useWatchlistToggle());

      expect(result.current.isWatchlistResolving).toBe(true);
    });

    it('確定したら未確定ではなくなる', () => {
      const { result } = renderHook(() => useWatchlistToggle());

      expect(result.current.isWatchlistResolving).toBe(false);
    });

    it('トグルしても何も起きない', async () => {
      mockLookupResolving = true;

      const { result } = renderHook(() => useWatchlistToggle());

      await act(async () => {
        result.current.toggleWatchlist(createMovie());
      });

      expect(mockAddWatchlist).not.toHaveBeenCalled();
      expect(mockRemoveWatchlist).not.toHaveBeenCalled();
      // 楽観的な成功トーストも出さない（出すと直後にエラーが重なる）
      expect(mockToast).not.toHaveBeenCalled();
      // ログイン誘導も出さない（ログイン済みなので誤誘導になる）
      expect(mockOpenLoginPrompt).not.toHaveBeenCalled();
    });
  });

  it('ウォッチリストにない映画のトグルでaddWatchlistが呼ばれる', async () => {
    const { result } = renderHook(() => useWatchlistToggle());

    await act(async () => {
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

  it('ウォッチリストにある映画のトグルでremoveWatchlistが呼ばれる', async () => {
    setupCacheWithItem(42, 'watchlist-id-123');
    const { result } = renderHook(() => useWatchlistToggle());

    await act(async () => {
      result.current.toggleWatchlist(createMovie());
    });

    expect(mockRemoveWatchlist).toHaveBeenCalledWith('watchlist-id-123');
    expect(mockToast).toHaveBeenCalledWith({
      title: WATCHLIST_SUCCESS_MESSAGES.REMOVED,
      variant: 'success',
    });
  });

  it('何も操作していなければ isMovieToggling は false', () => {
    const { result } = renderHook(() => useWatchlistToggle());

    expect(result.current.isMovieToggling(42)).toBe(false);
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

  it('セッション未確定の間はログイン誘導を出さない', () => {
    // ログイン済みの利用者がフルロードした直後に当たる窓（#1131）。
    // ここで弾くと「ログイン済みなのにログインを求められる」になる
    mockUseSession.mockReturnValue({ data: null, status: 'loading' });
    const { result } = renderHook(() => useWatchlistToggle());

    act(() => {
      result.current.toggleWatchlist(createMovie());
    });

    expect(mockOpenLoginPrompt).not.toHaveBeenCalled();
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

    it('gtag が無くても操作は成立する', async () => {
      delete window.gtag;
      const { result } = renderHook(() => useWatchlistToggle());

      // 例外が出ればこの await で落ちる
      await act(async () => {
        result.current.toggleWatchlist(createMovie());
      });
      expect(mockAddWatchlist).toHaveBeenCalled();
    });

    it('mutation の完了を待たずに送る（試行数を数える）', () => {
      // 操作時点で送る設計の帰結。「追加された数」ではなく「追加を試みた数」
      // になる。通信が解決する前に送られていることで固定する（#938）。
      // 失敗時も送られたままになる側は useWatchlist.test.ts で検証している
      const { result } = renderHook(() => useWatchlistToggle());

      act(() => {
        result.current.toggleWatchlist(createMovie());
      });

      expect(gtag).toHaveBeenCalledWith(
        'event',
        ANALYTICS_EVENTS.WATCHLIST_ADD,
        { movie_id: 42 },
      );
    });
  });
  /**
   * タイルと詳細モーダルは別インスタンス。
   *
   * 以前は `useToast()` の toasts 購読で全消費者が再レンダリングされる
   * という**偶然の依存**で同期していた。購読を外すと壊れる状態だった（#1009）
   */
  describe('インスタンス間の同期', () => {
    it('別インスタンスで追加すると、こちらの isInWatchlist も true になる', () => {
      const tile = renderHook(() => useWatchlistToggle());
      const modal = renderHook(() => useWatchlistToggle());

      expect(tile.result.current.isInWatchlist(42)).toBe(false);

      act(() => {
        modal.result.current.toggleWatchlist(createMovie());
      });

      expect(tile.result.current.isInWatchlist(42)).toBe(true);
    });

    /**
     * 本丸。キャッシュ**だけ**が変わったときに追従できるか。
     *
     * 楽観状態の共有だけでは「モーダル → タイル」は直るが、
     * 「サイドバーから削除 → タイル」のようにキャッシュ経由でしか
     * 伝わらない変化が永久に反映されない（#1009 の原因記述そのもの）
     */
    it('キャッシュだけが変わっても追従する', () => {
      const { result } = renderHook(() => useWatchlistToggle());
      const before = result.current.isInWatchlist;

      expect(before(42)).toBe(false);

      act(() => {
        setupCacheWithItem(42, 'watchlist-1');
        emitCacheEvent();
      });

      // 値だけ見ても意味が無い。isInWatchlist はクロージャなので、
      // **再描画されなくても**呼び直せば新しいキャッシュを読んで true を返す。
      // 画面に出るかどうかは「参照が変わった＝再描画された」かで決まる
      expect(result.current.isInWatchlist).not.toBe(before);
      expect(result.current.isInWatchlist(42)).toBe(true);
    });

    /**
     * 楽観状態を QueryClient 単位で共有したため、後始末で対象を
     * 取り違えるとアプリ全体がリロードまで誤った表示になる。
     * 以前は ref で持っていたので、続けて別の作品を操作すると上書きされた
     */
    it('削除の後始末が、別の作品の楽観状態を消さない', async () => {
      setupCacheWithItems([
        { tmdbMovieId: 42, watchlistId: 'watchlist-42' },
        { tmdbMovieId: 99, watchlistId: 'watchlist-99' },
      ]);

      // どちらの通信も保留にして、42 だけ先に完了させる
      const resolvers = new Map<string, () => void>();
      mockRemoveWatchlist.mockImplementation(
        (id: string) =>
          new Promise<void>((resolve) => {
            resolvers.set(id, resolve);
          }),
      );

      const { result } = renderHook(() => useWatchlistToggle());

      await act(async () => {
        result.current.toggleWatchlist({ ...createMovie(), id: 42 });
      });
      await act(async () => {
        result.current.toggleWatchlist({ ...createMovie(), id: 99 });
      });

      // 42 の後始末が走る。ここで 99 を消すと、99 がキャッシュ由来の
      // 「まだ入っている」に戻ってしまう
      await act(async () => {
        resolvers.get('watchlist-42')?.();
      });

      expect(result.current.isInWatchlist(99)).toBe(false);
    });

    /**
     * `added` は react-query が observer を作る時点＝**レンダリング中**に
     * 同期で飛ぶ。拾うと別コンポーネントのレンダリング中に更新を
     * スケジュールしてしまうので購読から外してある（#1061）。
     *
     * ここで固定するのは「外しても取りこぼさない」側だけ。
     * レンダリング中の setState そのものはこのファイルの pub/sub が
     * 手書きのフェイクなので再現できず、
     * useWatchlistToggle.renderPhase.test.tsx で本物の QueryClient を使う
     */
    it('added だけでは再描画しない', () => {
      const { result } = renderHook(() => useWatchlistToggle());
      const before = result.current.isInWatchlist;

      act(() => {
        setupCacheWithItem(42, 'watchlist-1');
        emitCacheEvent(['watchlist'], 'added');
      });

      expect(result.current.isInWatchlist).toBe(before);
    });

    /**
     * 実際に起きる順序を1本に収めて記録する。
     *
     * ⚠️ `added` を購読に戻してもこのテストは通る（それを捕まえるのは
     * 上の「added だけでは再描画しない」と renderPhase の方）。ここが落ちるのは
     * `updated` の購読を壊したときで、その意味では
     * 「キャッシュだけが変わっても追従する」と検出力が重なっている
     */
    it('added を拾わなくても、後から来る updated で追従する', () => {
      const { result } = renderHook(() => useWatchlistToggle());
      const before = result.current.isInWatchlist;

      // 実際の順序。キャッシュに Query が作られ（added。この時点では空）、
      // その後データが入る（updated）
      act(() => {
        emitCacheEvent(['watchlist'], 'added');
        setupCacheWithItem(42, 'watchlist-1');
        emitCacheEvent(['watchlist'], 'updated');
      });

      expect(result.current.isInWatchlist).not.toBe(before);
      expect(result.current.isInWatchlist(42)).toBe(true);
    });

    it('無関係なキーのキャッシュ変化では追従しない', () => {
      const { result } = renderHook(() => useWatchlistToggle());
      const before = result.current.isInWatchlist;

      act(() => {
        emitCacheEvent(['movies', 'detail', 1]);
      });

      expect(result.current.isInWatchlist).toBe(before);
    });

    it('別インスタンスで削除すると、こちらの isInWatchlist も false になる', () => {
      setupCacheWithItem(42, 'watchlist-1');

      const tile = renderHook(() => useWatchlistToggle());
      const modal = renderHook(() => useWatchlistToggle());

      expect(tile.result.current.isInWatchlist(42)).toBe(true);

      act(() => {
        modal.result.current.toggleWatchlist(createMovie());
      });

      expect(tile.result.current.isInWatchlist(42)).toBe(false);
    });
  });

  /**
   * 通信中かどうかの判定（#1055）
   *
   * ⚠️ **ここは useMutation の isPending では検証できない。** このファイルの
   * モックは isPending を常に false で返すし、本物でも mutation 1つにつき
   * フラグ1つなので「同時に2件飛んでいる」状態を表現できない。
   * 判定は QueryClient 単位の `toggling` を見ること。
   *
   * 手法は「削除の後始末が、別の作品の楽観状態を消さない」と同じで、
   * **両方の通信を保留にして片方だけ完了させる**（PR #1054）
   */
  describe('通信中の判定', () => {
    /**
     * 完了を test 側から制御できる removeWatchlist / addWatchlist に差し替える
     *
     * ⚠️ `jest.clearAllMocks()` は mockImplementation を消さない。
     * この describe の後ろに別の describe を足すと、保留のまま解決されない
     * 実装が漏れて**そちらがハングする**。足すときは戻すこと
     */
    const pendRemovals = () => {
      const resolvers = new Map<string, () => void>();
      mockRemoveWatchlist.mockImplementation(
        (id: string) =>
          new Promise<void>((resolve) => {
            resolvers.set(id, resolve);
          }),
      );
      return resolvers;
    };

    /** 追加側。キーは tmdb_movie_id */
    const pendAdds = () => {
      const resolvers = new Map<number, () => void>();
      mockAddWatchlist.mockImplementation(
        (item: { tmdb_movie_id: number }) =>
          new Promise<void>((resolve) => {
            resolvers.set(item.tmdb_movie_id, resolve);
          }),
      );
      return resolvers;
    };

    it('作品Aの通信中に作品Bを操作しても、Aは通信中のまま', async () => {
      setupCacheWithItems([
        { tmdbMovieId: 42, watchlistId: 'watchlist-42' },
        { tmdbMovieId: 99, watchlistId: 'watchlist-99' },
      ]);
      pendRemovals();

      const { result } = renderHook(() => useWatchlistToggle());

      await act(async () => {
        result.current.toggleWatchlist({ ...createMovie(), id: 42 });
      });
      expect(result.current.isMovieToggling(42)).toBe(true);

      // ref で持っていた頃は、この操作で 42 の印が 99 に上書きされ、
      // **42 のボタンが通信中なのに有効へ戻って**いた
      await act(async () => {
        result.current.toggleWatchlist({ ...createMovie(), id: 99 });
      });

      expect(result.current.isMovieToggling(42)).toBe(true);
      expect(result.current.isMovieToggling(99)).toBe(true);
    });

    it('片方の通信が終わっても、もう片方は通信中のまま', async () => {
      setupCacheWithItems([
        { tmdbMovieId: 42, watchlistId: 'watchlist-42' },
        { tmdbMovieId: 99, watchlistId: 'watchlist-99' },
      ]);
      const resolvers = pendRemovals();

      const { result } = renderHook(() => useWatchlistToggle());

      await act(async () => {
        result.current.toggleWatchlist({ ...createMovie(), id: 42 });
      });
      await act(async () => {
        result.current.toggleWatchlist({ ...createMovie(), id: 99 });
      });

      await act(async () => {
        resolvers.get('watchlist-42')?.();
      });

      // 終わった方だけ押せるようになる。両方 false なら 99 のボタンが
      // 通信中に押せてしまい、両方 true ならリロードまで押せないままになる
      expect(result.current.isMovieToggling(42)).toBe(false);
      expect(result.current.isMovieToggling(99)).toBe(true);
    });

    it('同じ作品を連打しても重複リクエストが飛ばない', async () => {
      setupCacheWithItem(42, 'watchlist-42');
      pendRemovals();

      const { result } = renderHook(() => useWatchlistToggle());

      await act(async () => {
        result.current.toggleWatchlist(createMovie());
        result.current.toggleWatchlist(createMovie());
        result.current.toggleWatchlist(createMovie());
      });

      expect(mockRemoveWatchlist).toHaveBeenCalledTimes(1);
      // 2回目以降が素通りすると、楽観状態が removes → adds と反転して
      // **削除の最中に追加**が飛ぶ
      expect(mockAddWatchlist).not.toHaveBeenCalled();
    });

    it('通信が失敗しても通信中のままにならない', async () => {
      setupCacheWithItem(42, 'watchlist-42');
      mockRemoveWatchlist.mockRejectedValueOnce(new Error('失敗'));

      const { result } = renderHook(() => useWatchlistToggle());

      await act(async () => {
        result.current.toggleWatchlist(createMovie());
      });

      // 後始末を onSettled に置く理由。onSuccess だと失敗した作品の
      // ボタンがリロードまで無効のままになる
      expect(result.current.isMovieToggling(42)).toBe(false);
    });

    /**
     * ⚠️ **追加側も別に見る。** 削除側だけだと、`addMutation.onSettled` の
     * 後始末を消しても `toggleWatchlist` の印を消しても**1本も落ちない**
     * （レビュー指摘で実測）。消し残すとボタンがリロードまで無効になる
     */
    it('未登録の作品を連打しても重複リクエストが飛ばない', async () => {
      pendAdds();

      const { result } = renderHook(() => useWatchlistToggle());

      await act(async () => {
        result.current.toggleWatchlist(createMovie());
        result.current.toggleWatchlist(createMovie());
        result.current.toggleWatchlist(createMovie());
      });

      expect(mockAddWatchlist).toHaveBeenCalledTimes(1);
      expect(result.current.isMovieToggling(42)).toBe(true);
    });

    it('追加でも、片方の通信が終わればもう片方は通信中のまま', async () => {
      const resolvers = pendAdds();

      const { result } = renderHook(() => useWatchlistToggle());

      await act(async () => {
        result.current.toggleWatchlist({ ...createMovie(), id: 42 });
      });
      await act(async () => {
        result.current.toggleWatchlist({ ...createMovie(), id: 99 });
      });

      expect(result.current.isMovieToggling(42)).toBe(true);
      expect(result.current.isMovieToggling(99)).toBe(true);

      await act(async () => {
        resolvers.get(42)?.();
      });

      expect(result.current.isMovieToggling(42)).toBe(false);
      expect(result.current.isMovieToggling(99)).toBe(true);
    });

    /**
     * `isInWatchlist` と同じく、**答えが変わるときは参照も変わる**契約。
     * 呼び出し側が `useMemo(() => isMovieToggling(id), [isMovieToggling, id])`
     * と書いている（movieDetailContent.tsx / awardsPage.tsx 経由の memo 済み
     * コンポーネント）。useCallback の deps から version を外すと値が凍る
     */
    it('通信中になると isMovieToggling の参照も変わる', async () => {
      setupCacheWithItem(42, 'watchlist-42');
      pendRemovals();

      const { result } = renderHook(() => useWatchlistToggle());
      const before = result.current.isMovieToggling;

      await act(async () => {
        result.current.toggleWatchlist(createMovie());
      });

      expect(result.current.isMovieToggling).not.toBe(before);
    });

    it('未認証なら通信中にならない', async () => {
      mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' });

      const { result } = renderHook(() => useWatchlistToggle());

      await act(async () => {
        result.current.toggleWatchlist(createMovie());
      });

      // 通信は出ない。認証チェックより前に印を付けると、ログイン誘導を
      // 閉じた後もそのボタンがリロードまで無効のままになる
      expect(mockAddWatchlist).not.toHaveBeenCalled();
      expect(result.current.isMovieToggling(42)).toBe(false);
    });
  });
});
