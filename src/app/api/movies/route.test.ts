/**
 * @jest-environment node
 */

/**
 * 映画一覧API Route テスト
 */

import { MOVIES_ERROR_MESSAGES } from '@/constants/movies';
import { SEARCH_VALIDATION } from '@/constants/search';

// --- Mocks ---

// モジュールスコープの状態を持ち越さないよう、テストごとにリロードする
// （ジャンルキャッシュは #1278 で getGenres 側へ移ったが、ルートの
//  module-level の初期化はここでリセットしておく）
let GET: typeof import('./route').GET;

const mockGetAuthSession = jest.fn().mockResolvedValue(null);
jest.mock('@/helpers/auth', () => ({
  getAuthSession: (...args: unknown[]) => mockGetAuthSession(...args),
}));

const mockSyncNowPlayingMovies = jest.fn().mockResolvedValue({ synced: 0 });
jest.mock('@/lib/sync/syncNowPlayingMovies', () => ({
  syncNowPlayingMovies: (...args: unknown[]) =>
    mockSyncNowPlayingMovies(...args),
}));

const mockSyncUpcomingMovies = jest.fn().mockResolvedValue({ upserted: 0 });
jest.mock('@/lib/sync/syncUpcomingMovies', () => ({
  syncUpcomingMovies: (...args: unknown[]) => mockSyncUpcomingMovies(...args),
}));

const mockSyncStreamingMovies = jest.fn().mockResolvedValue({ upserted: 0 });
jest.mock('@/lib/sync/syncStreamingMovies', () => ({
  syncStreamingMovies: (...args: unknown[]) => mockSyncStreamingMovies(...args),
}));

const mockDiscoverMovies = jest.fn().mockResolvedValue({
  results: [],
  total_pages: 0,
});
const mockGetGenres = jest.fn().mockResolvedValue([
  { id: 28, name: 'アクション' },
  { id: 35, name: 'コメディ' },
]);
const mockGetMovieKeywordIds = jest.fn().mockResolvedValue([]);
jest.mock('@/lib/tmdb/tmdb', () => ({
  discoverMovies: (...args: unknown[]) => mockDiscoverMovies(...args),
  getGenres: (...args: unknown[]) => mockGetGenres(...args),
  getMovieKeywordIds: (...args: unknown[]) => mockGetMovieKeywordIds(...args),
}));

/**
 * 生成されたチェインモックの記録
 *
 * 総件数クエリとデータクエリは別インスタンスとして生成されるため、
 * 「どのフィルタが適用されたか」はチェイン単体では追えない。
 * 生成分をすべて記録しておき、横断してフィルタ呼び出しを検証する
 */
const createdChains: Record<string, jest.Mock>[] = [];

/**
 * 記録済みチェインに適用されたフィルタ呼び出しを集約する
 *
 * @param method - 収集対象のメソッド名（eq / gt など）
 * @returns [カラム名, 値] の配列
 */
function collectFilterCalls(method: string): unknown[][] {
  return createdChains.flatMap((chain) => chain[method]?.mock.calls ?? []);
}

/**
 * 件数チェッククエリ（1本目の `from()`）に渡された絞り込み
 *
 * ⚠️ `collectFilterCalls` は全チェーンを合算するので、**一覧クエリの
 * `eq` まで混ざる**。どのクエリで絞ったかを見たいときは使えない。
 */
function countEqCalls(): unknown[][] {
  return createdChains[0]?.eq?.mock.calls ?? [];
}

/**
 * Supabaseチェイン可能なクエリビルダーのモックを作成
 */
function createChainMock(resolveValue: unknown = { data: null, error: null }) {
  const chain: Record<string, jest.Mock> = {};
  createdChains.push(chain);
  const methods = [
    'select',
    'eq',
    'neq',
    'in',
    'is',
    'order',
    'limit',
    'single',
    'range',
    'gt',
    'gte',
    'lte',
    'or',
    'upsert',
  ];

  for (const method of methods) {
    chain[method] = jest.fn();
  }

  // すべてのメソッドがチェインを返す（thenableとして解決可能）
  for (const method of methods) {
    chain[method].mockImplementation(() => {
      // thenableにして、awaitで解決できるようにする
      const proxy = new Proxy(chain, {
        get(target, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolveValue);
          }
          // count/dataなどの直接プロパティアクセス
          if (
            typeof prop === 'string' &&
            prop in (resolveValue as Record<string, unknown>)
          ) {
            return (resolveValue as Record<string, unknown>)[prop];
          }
          return target[prop as string];
        },
      });
      return proxy;
    });
  }

  return chain;
}

let mockSupabaseClient: { from: jest.Mock; rpc: jest.Mock } | null;
const mockDbConnectionErrorResponse = jest.fn(
  () =>
    new Response(JSON.stringify({ success: false, error: 'DB接続エラー' }), {
      status: 500,
    }),
);

jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => mockSupabaseClient,
  dbConnectionErrorResponse: () => mockDbConnectionErrorResponse(),
}));

// レート制限は専用テストで検証する。ここでモックしないと
// consume_rate_limit の rpc 呼び出しが mockRpc の順序を1つずらす
const mockEnforcePublicRateLimit = jest.fn();
jest.mock('@/helpers/publicRateLimit', () => ({
  enforcePublicRateLimit: (...args: unknown[]) =>
    mockEnforcePublicRateLimit(...args),
}));

// --- Helpers ---

const createRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/movies');
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  return new Request(url.toString());
};

/**
 * 標準のfromモック設定を構築（theatrical + upcoming）
 *
 * ⚠️ 1回目は **`release_type='theatrical'` の件数チェック**（#1000）。
 * 以前は `cached_at` を読む鮮度判定だったが、事前同期を
 * `/api/cron/sync-upcoming` へ移したので、残っているのは
 * 「0件のときだけフォールバック」だけ。
 *
 * existingCount: movie_cache にある theatrical 行の件数
 * countResult: カウントクエリの結果
 * dataResult: データクエリの結果
 * existingOtherType: 他のrelease_typeで既存のID
 */
/**
 * 一覧クエリ（`count: 'exact'` 付き）に渡された select の内容
 *
 * カラムの取り漏れと `head: true` の付け足しを検知するために記録する。
 * `from()` の**呼び出し順に依存しない**のが狙い（#1311）
 */
let lastListSelect: { columns: string; opts: Record<string, unknown> } | null =
  null;

function setupFromMock(options: {
  existingCount?: number;
  /** 一覧クエリが返す件数（Content-Range 由来 / #1272） */
  countResult?: { count: number };
  /** 一覧クエリが返す行とエラー */
  dataResult?: { data: unknown[]; error: unknown };
  existingOtherType?: { data: unknown[]; error: unknown };
}) {
  const {
    existingCount = 100,
    countResult = { count: 0 },
    dataResult = { data: [], error: null },
    existingOtherType = { data: [], error: null },
  } = options;

  const callTracker = { count: 0 };

  mockSupabaseClient!.from.mockImplementation(() => {
    callTracker.count++;
    const currentCall = callTracker.count;

    if (currentCall === 1) {
      // theatrical 行の件数チェック（フォールバック判定 / #1000）
      return createChainMock({ count: existingCount });
    }
    if (currentCall === 2 || currentCall === 3) {
      // 一覧クエリ（件数とデータを1本で取る / #1272）か、
      // 他release_type既存IDクエリ。select の opts を見て判定する
      const listResult = { ...dataResult, count: countResult.count };
      const chain = createChainMock(listResult);
      chain.select.mockImplementation(
        (cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count === 'exact') {
            lastListSelect = { columns: cols, opts };

            // ⚠️ `head: true` を付けると PostgREST は本体を返さない。
            // モックでも同じにしないと、付け足す退行を検知できない（#1311）
            const result = opts.head
              ? { ...listResult, data: null }
              : listResult;

            return createThenableProxy(createChainMock(result), result);
          }
          // neqが呼ばれる → existingOtherType用
          return createThenableProxy(
            createChainMock(existingOtherType),
            existingOtherType,
          );
        },
      );
      return chain;
    }
    // それ以降（upsert等）
    return createChainMock({ error: null });
  });
}

function createThenableProxy(
  chain: Record<string, jest.Mock>,
  resolveValue: unknown,
) {
  return new Proxy(chain, {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(resolveValue);
      }
      if (
        typeof prop === 'string' &&
        prop in (resolveValue as Record<string, unknown>)
      ) {
        return (resolveValue as Record<string, unknown>)[prop];
      }
      const method = target[prop as string];
      if (typeof method === 'function') {
        return (...args: unknown[]) => {
          method(...args);
          return createThenableProxy(chain, resolveValue);
        };
      }
      return method;
    },
  });
}

/**
 * now_showing+theatricalパス用のfromモック
 * 1回目: is_now_playing 件数チェック（フォールバック判定 / #983）
 * 2回目: カウントクエリ
 * 3回目: データクエリ
 *
 * existingCount: movie_cache にある is_now_playing=true の件数
 */
function setupNowPlayingFromMock(options: {
  existingCount?: number;
  countResult?: { count: number };
  dataResult?: { data: unknown[]; error: unknown };
}) {
  const {
    existingCount = 100,
    countResult = { count: 0 },
    dataResult = { data: [], error: null },
  } = options;

  const callTracker = { count: 0 };

  mockSupabaseClient!.from.mockImplementation(() => {
    callTracker.count++;
    const currentCall = callTracker.count;

    if (currentCall === 1) {
      // is_now_playing 件数チェック
      return createChainMock({ count: existingCount });
    }
    if (currentCall === 2) {
      // カウントクエリ
      const chain = createChainMock(countResult);
      chain.select.mockImplementation(
        (_cols: string, opts?: { count?: string }) => {
          if (opts?.count === 'exact') {
            return createThenableProxy(
              createChainMock(countResult),
              countResult,
            );
          }
          return createThenableProxy(createChainMock(dataResult), dataResult);
        },
      );
      return chain;
    }
    if (currentCall === 3) {
      // データクエリ
      return createChainMock(dataResult);
    }
    return createChainMock({ error: null });
  });
}

/**
 * streamingパス用のfromモック
 * 1回目: streaming件数チェック（フォールバック判定）
 * 2回目: カウントクエリ
 * 3回目: データクエリ
 *
 * existingCount: movie_cache にある streaming レコード件数
 */
function setupStreamingFromMock(options: {
  existingCount?: number;
  countResult?: { count: number };
  dataResult?: { data: unknown[]; error: unknown };
}) {
  const {
    existingCount = 100,
    countResult = { count: 0 },
    dataResult = { data: [], error: null },
  } = options;

  const callTracker = { count: 0 };

  mockSupabaseClient!.from.mockImplementation(() => {
    callTracker.count++;
    const currentCall = callTracker.count;

    if (currentCall === 1) {
      // streaming件数チェック
      return createChainMock({ count: existingCount });
    }
    if (currentCall === 2) {
      // カウントクエリ or データクエリ
      const chain = createChainMock(countResult);
      chain.select.mockImplementation(
        (_cols: string, opts?: { count?: string }) => {
          if (opts?.count === 'exact') {
            return createThenableProxy(
              createChainMock(countResult),
              countResult,
            );
          }
          return createThenableProxy(createChainMock(dataResult), dataResult);
        },
      );
      return chain;
    }
    // データクエリ
    return createChainMock(dataResult);
  });
}

/**
 * キャッシュ期限切れのDiscover APIフロー用のfromモック
 */
function setupExpiredCacheFromMock(options: {
  discoverResults?: unknown[];
  countResult?: { count: number };
  dataResult?: { data: unknown[]; error: unknown };
}) {
  const {
    discoverResults = [],
    countResult = { count: 0 },
    dataResult = { data: [], error: null },
  } = options;

  const callTracker = { count: 0 };

  mockSupabaseClient!.from.mockImplementation(() => {
    callTracker.count++;
    const currentCall = callTracker.count;

    if (currentCall === 1) {
      // キャッシュチェッククエリ → 期限切れ（null）
      return createChainMock({ data: null, error: null });
    }
    // TMDb結果のupsert（別release_typeの既存IDクエリは廃止済み）
    if (discoverResults.length > 0 && currentCall <= 1 + 5) {
      return createChainMock({ error: null });
    }
    // カウントクエリ
    const chain = createChainMock(countResult);
    chain.select.mockImplementation(
      (_cols: string, opts?: { count?: string }) => {
        if (opts?.count === 'exact') {
          return createThenableProxy(createChainMock(countResult), countResult);
        }
        return createThenableProxy(createChainMock(dataResult), dataResult);
      },
    );
    return chain;
  });
}

// --- Tests ---

describe('GET /api/movies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createdChains.length = 0;
    lastListSelect = null;
    // モジュールスコープの状態を持ち越さないようリロードする
    jest.resetModules();

    // 既定は上限内（null を返すと通過）
    mockEnforcePublicRateLimit.mockResolvedValue(null);

    // Supabaseクライアントをデフォルトで有効化
    mockSupabaseClient = {
      from: jest.fn(),
      // TMDb同期のUPSERTは upsert_movie_cache RPC 経由
      rpc: jest.fn().mockResolvedValue({ data: 0, error: null }),
    };
  });

  // モジュールを動的にインポートするヘルパー
  async function loadGET() {
    const mod = await import('./route');
    GET = mod.GET;
    return GET;
  }

  // === Supabaseクライアント検証 ===

  it('Supabaseクライアントがnullの場合、dbConnectionErrorResponseを返す', async () => {
    mockSupabaseClient = null;
    const handler = await loadGET();
    const response = await handler(createRequest());

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(mockDbConnectionErrorResponse).toHaveBeenCalled();
  });

  // === バリデーションエラー ===

  it('pageが負数の場合、400を返す', async () => {
    const handler = await loadGET();
    setupFromMock({});
    const response = await handler(createRequest({ page: '-1' }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.message).toBe(MOVIES_ERROR_MESSAGES.INVALID_QUERY);
  });

  it('pageが0の場合、400を返す', async () => {
    const handler = await loadGET();
    setupFromMock({});
    const response = await handler(createRequest({ page: '0' }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('不正なsort_byの場合、400を返す', async () => {
    const handler = await loadGET();
    setupFromMock({});
    const response = await handler(createRequest({ sort_by: 'invalid' }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error.details).toBeDefined();
  });

  it('不正なrelease_typeの場合、400を返す', async () => {
    const handler = await loadGET();
    setupFromMock({});
    const response = await handler(createRequest({ release_type: 'dvd' }));

    expect(response.status).toBe(400);
  });

  it('不正なtime_frameの場合、400を返す', async () => {
    const handler = await loadGET();
    setupFromMock({});
    const response = await handler(createRequest({ time_frame: 'past' }));

    expect(response.status).toBe(400);
  });

  it('不正な日付形式のrelease_date_gteの場合、400を返す', async () => {
    const handler = await loadGET();
    setupFromMock({});
    const response = await handler(
      createRequest({ release_date_gte: '2024/01/01' }),
    );

    expect(response.status).toBe(400);
  });

  // 形式の正規表現は桁数しか見ないため、存在しない日付が Postgres の
  // date 比較まで到達して 500 になっていた（#995）。
  // 実測では「文字列比較で today を超える値」だけが丸めを免れて到達する
  // （`2026-13-45` は 500 / `2026-02-30` は today へ丸められて 200）。
  // 到達するかに関係なく、入口で 400 にする
  describe('日付の実在性（#995）', () => {
    it.each([
      ['月が範囲外', '2026-13-45'],
      ['日が範囲外', '2026-02-30'],
      ['ゼロ日付', '0000-00-00'],
      ['うるう年でない2月29日', '2026-02-29'],
    ])(
      '開始日が%s（%s）の場合、500ではなく400を返す',
      async (_label, value) => {
        const handler = await loadGET();
        setupFromMock({});

        const response = await handler(
          createRequest({ release_date_gte: value }),
        );

        expect(response.status).toBe(400);
        const json = await response.json();
        expect(json.success).toBe(false);
        expect(json.error.code).toBe('VALIDATION_ERROR');
      },
    );

    it('終了日が存在しない日付でも400を返す', async () => {
      const handler = await loadGET();
      setupFromMock({});

      const response = await handler(
        createRequest({ release_date_lte: '2026-13-45' }),
      );

      expect(response.status).toBe(400);
    });

    it('うるう年の2月29日は従来どおり200を返す', async () => {
      const handler = await loadGET();
      setupFromMock({
        countResult: { count: 0 },
        dataResult: { data: [], error: null },
      });

      const response = await handler(
        createRequest({ release_date_gte: '2024-02-29' }),
      );

      expect(response.status).toBe(200);
    });
  });

  // 開始日が終了日より後だと、どう絞り込んでも空集合になる。
  // 200 / 0件で返していたため「該当なし」と区別が付かなかった（#995）
  describe('開始日と終了日の相関（#995）', () => {
    it('開始日が終了日より後の場合、400を返す', async () => {
      const handler = await loadGET();
      setupFromMock({});

      const response = await handler(
        createRequest({
          release_date_gte: '2027-01-01',
          release_date_lte: '2026-01-01',
        }),
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(json.error.details.release_date_lte).toEqual([
        '終了日は開始日以降の日付を指定してください',
      ]);
    });

    it('開始日と終了日が同じ場合は200を返す（その日1日の絞り込み）', async () => {
      const handler = await loadGET();
      setupFromMock({
        countResult: { count: 0 },
        dataResult: { data: [], error: null },
      });

      const response = await handler(
        createRequest({
          release_date_gte: '2026-05-01',
          release_date_lte: '2026-05-01',
        }),
      );

      expect(response.status).toBe(200);
    });

    it('開始日が終了日より前の場合は従来どおり200を返す', async () => {
      const handler = await loadGET();
      setupFromMock({
        countResult: { count: 0 },
        dataResult: { data: [], error: null },
      });

      const response = await handler(
        createRequest({
          release_date_gte: '2026-01-01',
          release_date_lte: '2026-12-31',
        }),
      );

      expect(response.status).toBe(200);
    });

    it('片側のみの指定では相関チェックが働かない', async () => {
      const handler = await loadGET();
      setupFromMock({
        countResult: { count: 0 },
        dataResult: { data: [], error: null },
      });

      const response = await handler(
        createRequest({ release_date_lte: '2020-01-01' }),
      );

      expect(response.status).toBe(200);
    });
  });

  // === 正常系: upcoming + theatrical (デフォルト) ===

  it('デフォルトパラメータで正常に200を返す', async () => {
    const handler = await loadGET();
    const movies = [
      {
        id: 1,
        title: 'テスト映画',
        release_date: '2026-04-01',
        genre_ids: [28],
      },
    ];

    setupFromMock({
      countResult: { count: 1 },
      dataResult: { data: movies, error: null },
    });

    const response = await handler(createRequest());
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.movies).toEqual(movies);
    expect(json.data.pagination.currentPage).toBe(1);
    expect(json.data.pagination.totalItems).toBe(1);
    expect(json.data.genres).toBeDefined();
  });

  it('ページネーション情報が正しく計算される（複数ページ）', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 50 },
      dataResult: { data: Array(20).fill({ id: 1 }), error: null },
    });

    const response = await handler(createRequest({ page: '1' }));
    const json = await response.json();

    expect(json.data.pagination.totalPages).toBe(3); // 50 / 20 = 2.5 → ceil = 3
    expect(json.data.pagination.hasNextPage).toBe(true);
    expect(json.data.pagination.nextPage).toBe(2);
    expect(json.data.pagination.itemsPerPage).toBe(20);
  });

  it('最終ページではhasNextPageがfalse', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 25 },
      dataResult: { data: Array(5).fill({ id: 1 }), error: null },
    });

    const response = await handler(createRequest({ page: '2' }));
    const json = await response.json();

    expect(json.data.pagination.hasNextPage).toBe(false);
    expect(json.data.pagination.nextPage).toBeNull();
  });

  // === ソート ===

  it('sort_by=popularityで正常に処理される', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(createRequest({ sort_by: 'popularity' }));
    expect(response.status).toBe(200);
  });

  it('sort_by=vote_averageで正常に処理される', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(createRequest({ sort_by: 'vote_average' }));
    expect(response.status).toBe(200);
  });

  it('sort_order=descが指定された場合、正常に処理される', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(createRequest({ sort_order: 'desc' }));
    expect(response.status).toBe(200);
  });

  it('sort_order=ascが指定された場合、正常に処理される', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(createRequest({ sort_order: 'asc' }));
    expect(response.status).toBe(200);
  });

  // === ジャンルフィルタ ===

  it('genre_idsが指定された場合、正常にフィルタされる', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 5 },
      dataResult: { data: [{ id: 1, genre_ids: [28] }], error: null },
    });

    const response = await handler(createRequest({ genre_ids: '28,35' }));
    expect(response.status).toBe(200);
  });

  it('genre_idsが未指定の場合、フィルタなしで処理される', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(createRequest({}));
    expect(response.status).toBe(200);
  });

  it('空のgenre_idsの場合、400を返す', async () => {
    const handler = await loadGET();
    setupFromMock({});

    const response = await handler(createRequest({ genre_ids: '' }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('数値以外を含むgenre_idsの場合、400を返す', async () => {
    const handler = await loadGET();
    setupFromMock({});

    const response = await handler(createRequest({ genre_ids: '1,foo,3' }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error.details).toBeDefined();
  });

  it(`genre_idsが上限（${SEARCH_VALIDATION.MAX_GENRE_IDS}件）ちょうどの場合、正常に処理される`, async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const genre_ids = Array.from(
      { length: SEARCH_VALIDATION.MAX_GENRE_IDS },
      (_, i) => i + 1,
    ).join(',');
    const response = await handler(createRequest({ genre_ids }));

    expect(response.status).toBe(200);
  });

  it(`genre_idsが上限（${SEARCH_VALIDATION.MAX_GENRE_IDS}件）を超える場合、400を返す`, async () => {
    const handler = await loadGET();
    setupFromMock({});

    const genre_ids = Array.from(
      { length: SEARCH_VALIDATION.MAX_GENRE_IDS + 1 },
      (_, i) => i + 1,
    ).join(',');
    const response = await handler(createRequest({ genre_ids }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error.details).toBeDefined();
  });

  // === is_revival フィルタ ===

  it('is_revival=trueが指定された場合、正常に処理される', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(createRequest({ is_revival: 'true' }));
    expect(response.status).toBe(200);
  });

  it('is_revival=falseが指定された場合、正常に処理される', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(createRequest({ is_revival: 'false' }));
    expect(response.status).toBe(200);
  });

  // === 日付フィルタ ===

  it('release_date_gteが指定された場合、正常に処理される', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({ release_date_gte: '2026-06-01' }),
    );
    expect(response.status).toBe(200);
  });

  it('release_date_lteが指定された場合、正常に処理される', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({ release_date_lte: '2026-12-31' }),
    );
    expect(response.status).toBe(200);
  });

  it('release_date_gte と release_date_lte の両方が指定された場合', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({
        release_date_gte: '2026-06-01',
        release_date_lte: '2026-12-31',
      }),
    );
    expect(response.status).toBe(200);
  });

  // === キャッシュ鮮度判定 ===

  // === theatrical + upcoming の事前同期CRON化（#1000） ===
  //
  // 事前同期は /api/cron/sync-upcoming（日次）が行う。リクエスト起点の同期は
  // 「レコードが0件」のフォールバックだけに絞っている。
  //
  // ⚠️ もとは `cached_at` を見て6時間で失効と判定し、**リクエスト処理の中で
  // 最大5ページの Discover を直列実行**していた。失効直後に最初に来た利用者が
  // 数十秒待たされるため、now_showing / streaming と同じ構成へ揃えた。

  describe('事前同期CRON化（#1000）', () => {
    it('キャッシュ済みレコードがあれば同期を呼ばない', async () => {
      const handler = await loadGET();
      setupFromMock({ existingCount: 100 });

      const response = await handler(createRequest());

      expect(response.status).toBe(200);
      expect(mockSyncUpcomingMovies).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ **`cached_at` を見ない**のがこの変更の主眼。
     *
     * 鮮度で判定を戻すと、失効直後の利用者がまた待たされる。
     * 古いデータを返す代わりに待たせない、という判断。
     */
    it('キャッシュが古くてもリクエスト起点で同期しない', async () => {
      const handler = await loadGET();
      setupFromMock({ existingCount: 100 });

      await handler(createRequest());

      expect(mockSyncUpcomingMovies).not.toHaveBeenCalled();
      expect(mockDiscoverMovies).not.toHaveBeenCalled();
    });

    // CRONが一度も走っていない場合に一覧が空になるのを避ける
    it('レコードが0件のときだけフォールバックで同期する', async () => {
      const handler = await loadGET();
      setupFromMock({ existingCount: 0 });

      const response = await handler(createRequest());

      expect(response.status).toBe(200);
      expect(mockSyncUpcomingMovies).toHaveBeenCalled();
    });

    // count が null（Supabase が件数を返さない）も0件として扱う
    it('countがnullの場合もフォールバック同期が走る', async () => {
      const handler = await loadGET();
      setupFromMock({ existingCount: null as unknown as number });

      await handler(createRequest());

      expect(mockSyncUpcomingMovies).toHaveBeenCalled();
    });

    /**
     * ⚠️ **件数は `is_now_playing` で絞らない。**
     *
     * 公開中の作品も `theatrical` 行として同じテーブルに入る。絞ると
     * 「公開予定が0件の日」に毎回フォールバックが走り、CRON化の意味が消える。
     */
    it('件数の絞り込みは release_type だけ', async () => {
      const handler = await loadGET();
      setupFromMock({ existingCount: 100 });

      await handler(createRequest());

      const eqCalls = countEqCalls();
      expect(eqCalls).toContainEqual(['release_type', 'theatrical']);
      expect(eqCalls.map((call) => call[0])).not.toContain('is_now_playing');
    });
  });

  // === now_showing + theatrical パス ===
  //
  // 事前同期は /api/cron/sync-now-playing（日次）が行う。リクエスト起点の
  // 同期は「レコードが0件」のフォールバックだけに絞っている（#983）

  it('now_showing+theatricalでキャッシュ済みレコードがある場合、syncを呼ばない', async () => {
    const handler = await loadGET();
    setupNowPlayingFromMock({
      existingCount: 100,
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({
        time_frame: 'now_showing',
        release_type: 'theatrical',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSyncNowPlayingMovies).not.toHaveBeenCalled();
  });

  // 失効直後のユーザーを数十秒待たせないため、古いだけでは同期しない。
  // cached_at を参照しない設計なので、どれだけ古くても走らない
  it('now_showing+theatricalはキャッシュが古くてもリクエスト起点で同期しない', async () => {
    const handler = await loadGET();
    setupNowPlayingFromMock({
      existingCount: 1,
      countResult: { count: 1 },
      dataResult: {
        data: [{ id: 500, title: '公開中の映画' }],
        error: null,
      },
    });

    const response = await handler(
      createRequest({
        time_frame: 'now_showing',
        release_type: 'theatrical',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSyncNowPlayingMovies).not.toHaveBeenCalled();
  });

  it('now_showing+theatricalでレコードが0件の場合のみ、フォールバックとして同期する', async () => {
    const handler = await loadGET();
    setupNowPlayingFromMock({
      existingCount: 0,
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({
        time_frame: 'now_showing',
        release_type: 'theatrical',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSyncNowPlayingMovies).toHaveBeenCalledTimes(1);
  });

  // count が null（head クエリが件数を返せなかった）でも、
  // 「0件」と同じくフォールバックへ倒して一覧が空のままになるのを防ぐ
  it('now_showing+theatricalでcountがnullの場合もフォールバック同期が走る', async () => {
    const handler = await loadGET();
    setupNowPlayingFromMock({
      existingCount: null as unknown as number,
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({
        time_frame: 'now_showing',
        release_type: 'theatrical',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSyncNowPlayingMovies).toHaveBeenCalledTimes(1);
  });

  it('now_showing+theatricalでrelease_date_gte/lteが追加フィルタとして適用される', async () => {
    const handler = await loadGET();
    setupNowPlayingFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({
        time_frame: 'now_showing',
        release_type: 'theatrical',
        release_date_gte: '2026-01-01',
        release_date_lte: '2026-03-31',
      }),
    );

    expect(response.status).toBe(200);
  });

  // === now_showing + streaming パス ===

  it('now_showing+streamingでキャッシュ済みレコードがある場合、discoverを呼ばない', async () => {
    const handler = await loadGET();
    setupStreamingFromMock({
      existingCount: 100,
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({
        time_frame: 'now_showing',
        release_type: 'streaming',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockDiscoverMovies).not.toHaveBeenCalled();
    expect(mockSyncStreamingMovies).not.toHaveBeenCalled();
  });

  it('now_showing+streamingでrelease_date_gteが範囲内の場合、ユーザー指定値が使われる', async () => {
    const handler = await loadGET();
    // 未来の日付を指定して、デフォルトのgteDateより大きくする
    const futureGte = '2026-03-08';
    setupStreamingFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({
        time_frame: 'now_showing',
        release_type: 'streaming',
        release_date_gte: futureGte,
      }),
    );

    expect(response.status).toBe(200);
  });

  it('now_showing+streamingでrelease_date_lteが指定されている場合', async () => {
    const handler = await loadGET();
    setupStreamingFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({
        time_frame: 'now_showing',
        release_type: 'streaming',
        release_date_lte: '2026-02-01',
      }),
    );

    expect(response.status).toBe(200);
  });

  // === streaming: JP配信実態による振り分け ===

  it('now_showing+streamingは配信中（is_currently_streaming=true）のみを返す', async () => {
    const handler = await loadGET();
    setupStreamingFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({ time_frame: 'now_showing', release_type: 'streaming' }),
    );

    expect(response.status).toBe(200);
    expect(collectFilterCalls('eq')).toContainEqual([
      'is_currently_streaming',
      true,
    ]);
    // 配信中タブではデジタル公開日で絞らない
    expect(
      collectFilterCalls('gt').some(
        ([column]) => column === 'digital_release_date',
      ),
    ).toBe(false);
  });

  it('upcoming+streamingは未配信かつデジタル公開日が未来のものを返す', async () => {
    const handler = await loadGET();
    setupStreamingFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({ time_frame: 'upcoming', release_type: 'streaming' }),
    );

    expect(response.status).toBe(200);
    expect(collectFilterCalls('eq')).toContainEqual([
      'is_currently_streaming',
      false,
    ]);
    expect(
      collectFilterCalls('gt').some(
        ([column]) => column === 'digital_release_date',
      ),
    ).toBe(true);
  });

  it('upcoming+streamingはrelease_dateの既定範囲で絞り込まない（劇場公開済みの配信予定を拾う）', async () => {
    const handler = await loadGET();
    setupStreamingFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    await handler(
      createRequest({ time_frame: 'upcoming', release_type: 'streaming' }),
    );

    expect(
      collectFilterCalls('gte').some(([column]) => column === 'release_date'),
    ).toBe(false);
  });

  it('upcoming+streamingでもユーザー指定のrelease_date_gteは追加フィルタとして適用する', async () => {
    const handler = await loadGET();
    setupStreamingFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    await handler(
      createRequest({
        time_frame: 'upcoming',
        release_type: 'streaming',
        release_date_gte: '2026-11-01',
      }),
    );

    expect(collectFilterCalls('gte')).toContainEqual([
      'release_date',
      '2026-11-01',
    ]);
  });

  it('upcoming+streamingの公開日順はdigital_release_dateで並べる', async () => {
    const handler = await loadGET();
    setupStreamingFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    await handler(
      createRequest({
        time_frame: 'upcoming',
        release_type: 'streaming',
        sort_by: 'release_date',
      }),
    );

    expect(collectFilterCalls('order')).toContainEqual([
      'digital_release_date',
      { ascending: true, nullsFirst: false },
    ]);
  });

  it('upcoming+streamingでも人気度順はpopularityで並べる', async () => {
    const handler = await loadGET();
    setupStreamingFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    await handler(
      createRequest({
        time_frame: 'upcoming',
        release_type: 'streaming',
        sort_by: 'popularity',
      }),
    );

    expect(
      collectFilterCalls('order').some(
        ([column]) => column === 'digital_release_date',
      ),
    ).toBe(false);
    expect(collectFilterCalls('order')).toContainEqual([
      'popularity',
      { ascending: false, nullsFirst: false },
    ]);
  });

  it('now_showing+streamingの公開日順はrelease_dateで並べる', async () => {
    const handler = await loadGET();
    setupStreamingFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    await handler(
      createRequest({
        time_frame: 'now_showing',
        release_type: 'streaming',
        sort_by: 'release_date',
      }),
    );

    expect(
      collectFilterCalls('order').some(
        ([column]) => column === 'digital_release_date',
      ),
    ).toBe(false);
  });

  it('レスポンスのselectにdigital_release_dateを含める', async () => {
    const handler = await loadGET();
    setupStreamingFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    await handler(
      createRequest({ time_frame: 'upcoming', release_type: 'streaming' }),
    );

    expect(
      collectFilterCalls('select').some(
        ([columns]) =>
          typeof columns === 'string' &&
          columns.includes('digital_release_date'),
      ),
    ).toBe(true);
  });

  it('theatricalでは配信状況で絞り込まない', async () => {
    const handler = await loadGET();
    setupFromMock({ countResult: { count: 0 } });

    await handler(
      createRequest({ time_frame: 'now_showing', release_type: 'theatrical' }),
    );

    expect(
      collectFilterCalls('eq').some(
        ([column]) => column === 'is_currently_streaming',
      ),
    ).toBe(false);
  });

  // === upcoming + theatrical (キャッシュ期限切れでDiscover API呼び出し) ===

  it('低評価の映画が除外される（vote_average < MIN_VOTE_AVERAGE）', async () => {
    const handler = await loadGET();

    mockDiscoverMovies.mockResolvedValueOnce({
      results: [
        {
          id: 204,
          title: '低評価映画',
          adult: false,
          original_language: 'ja',
          genre_ids: [28],
          vote_average: 1.0, // MIN_VOTE_AVERAGE(3) 未満
          popularity: 50,
        },
      ],
      total_pages: 1,
    });

    setupExpiredCacheFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(createRequest());
    expect(response.status).toBe(200);
  });

  it('低人気度の映画が除外される（popularity < MIN_POPULARITY）', async () => {
    const handler = await loadGET();

    mockDiscoverMovies.mockResolvedValueOnce({
      results: [
        {
          id: 205,
          title: '低人気映画',
          adult: false,
          original_language: 'ja',
          genre_ids: [28],
          vote_average: 7.0,
          popularity: 0.1, // MIN_POPULARITY(0.5) 未満
        },
      ],
      total_pages: 1,
    });

    setupExpiredCacheFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(createRequest());
    expect(response.status).toBe(200);
  });

  // === release_type: streaming ===

  it('release_type=streamingで正常に処理される', async () => {
    const handler = await loadGET();
    setupStreamingFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({ release_type: 'streaming' }),
    );
    expect(response.status).toBe(200);
  });

  // === upcoming + release_date_gte が未来日付の場合 ===

  it('upcomingでrelease_date_gteが今日より未来の場合、ユーザー指定値が使われる', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({
        time_frame: 'upcoming',
        release_date_gte: '2027-01-01',
      }),
    );
    expect(response.status).toBe(200);
  });

  it('upcomingでrelease_date_gteが過去の場合、今日の日付が使われる', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({
        time_frame: 'upcoming',
        release_date_gte: '2020-01-01',
      }),
    );
    expect(response.status).toBe(200);
  });

  // === DBクエリエラー ===

  it('データクエリでエラーが発生した場合、500を返す', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: {
        data: null as unknown as unknown[],
        error: { message: 'DB Error' },
      },
    });

    const response = await handler(createRequest());
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('SERVER_ERROR');
    expect(json.error.message).toBe(MOVIES_ERROR_MESSAGES.FETCH_FAILED);
  });

  // === 予期しない例外 ===

  it('予期しない例外が発生した場合、500を返す', async () => {
    const handler = await loadGET();
    mockGetGenres.mockRejectedValueOnce(new Error('TMDb API Error'));

    const response = await handler(createRequest());
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('SERVER_ERROR');
  });

  /**
   * 件数とデータを1クエリで取る（#1272）
   *
   * もとは `count: 'exact', head: true` の件数専用クエリを別に投げていた。
   * 戻すとデータクエリ側が `existingOtherType` の枝に落ちて落ちる
   */
  it('一覧は count: exact 付きの1クエリで取る', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 3 },
      dataResult: { data: [{ id: 1, title: '映画A' }], error: null },
    });

    const response = await handler(createRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(lastListSelect?.opts).toEqual({ count: 'exact' });
    expect(json.data.pagination.totalItems).toBe(3);
  });

  /**
   * ⚠️ `head: true` を付けると本体が返らない
   *
   * 件数専用クエリから移すときの事故ポイント。モックも PostgREST と同じく
   * `head: true` で `data: null` を返すので、付け足すとここで落ちる
   */
  it('一覧クエリに head を付けない', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 1 },
      dataResult: { data: [{ id: 1, title: '映画A' }], error: null },
    });

    const response = await handler(createRequest());
    const json = await response.json();

    expect(lastListSelect?.opts.head).toBeUndefined();
    expect(json.data.movies).toHaveLength(1);
  });

  /**
   * 最終ページより後ろは「空ページ」であってエラーではない（#1311）
   *
   * `count: 'exact'` のクエリは `offset > 総件数` で 416 (PGRST103) を返す。
   * 潰さないと公開エンドポイントの `?page=500` が 200 → 500 の回帰になる
   */
  it('範囲外のページは500ではなく空ページを返す', async () => {
    const handler = await loadGET();

    // 1本目: キャッシュ確認 / 2本目: 一覧（416） / 3本目: 件数の取り直し
    const rangeError = {
      data: null,
      count: null,
      error: { code: 'PGRST103', message: 'Requested range not satisfiable' },
    };
    const callTracker = { count: 0 };

    mockSupabaseClient!.from.mockImplementation(() => {
      callTracker.count += 1;

      if (callTracker.count === 1) {
        return createChainMock({
          data: { cached_at: new Date().toISOString() },
          error: null,
        });
      }

      const chain = createChainMock(rangeError);
      chain.select.mockImplementation(
        (_cols: string, opts?: { count?: string; head?: boolean }) => {
          // 取り直しは head: true の件数専用クエリ
          const result = opts?.head ? { count: 40, error: null } : rangeError;
          return createThenableProxy(createChainMock(result), result);
        },
      );
      return chain;
    });

    const response = await handler(createRequest({ page: '500' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.movies).toEqual([]);
    expect(json.data.pagination.totalItems).toBe(40);
    expect(json.data.pagination.hasNextPage).toBe(false);
  });

  // === ジャンルマップ ===

  it('ジャンルマップが正しく返される', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(createRequest());
    const json = await response.json();

    expect(json.data.genres).toEqual({
      '28': 'アクション',
      '35': 'コメディ',
    });
    expect(mockGetGenres).toHaveBeenCalledTimes(1);
  });

  /**
   * ⚠️ このルートは**ジャンルキャッシュを持たない**（#1278）。
   *
   * かつてここに module-level のキャッシュがあり、`/api/movies/genres` には
   * 効いていなかった。キャッシュは `getGenres()` 側へ移したので、ルートは
   * 毎回呼んでよい。TMDb を1回しか叩かないことは
   * `src/lib/tmdb/tmdb.test.ts` が検証している。
   *
   * ここにキャッシュを戻すと二重管理になり、失効のタイミングが
   * ルートごとにずれる
   */
  it('ルートはジャンルを自前でキャッシュせず、毎回 getGenres に任せる', async () => {
    const handler = await loadGET();

    // 1回目のリクエスト
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });
    await handler(createRequest());

    // 2回目のリクエスト
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });
    await handler(createRequest());

    expect(mockGetGenres).toHaveBeenCalledTimes(2);
  });

  // === moviesがnullの場合 ===

  it('moviesがnullの場合、空配列を返す', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: null as unknown as unknown[], error: null },
    });

    const response = await handler(createRequest());
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data.movies).toEqual([]);
  });

  // === totalItemsがnullの場合 ===

  it('countがnullの場合、totalItemsは0になる', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: null as unknown as number },
      dataResult: { data: [], error: null },
    });

    const response = await handler(createRequest());
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data.pagination.totalItems).toBe(0);
    expect(json.data.pagination.totalPages).toBe(0);
  });

  // === streaming の事前同期CRON化（リクエスト起点の同期はフォールバックのみ） ===

  it('streamingはキャッシュが古くてもリクエスト起点で同期しない', async () => {
    const handler = await loadGET();

    // cached_at を参照しない設計のため、古いキャッシュでも同期は走らない
    setupStreamingFromMock({
      existingCount: 50,
      countResult: { count: 1 },
      dataResult: {
        data: [{ id: 400, title: 'ストリーミング映画' }],
        error: null,
      },
    });

    const response = await handler(
      createRequest({
        time_frame: 'now_showing',
        release_type: 'streaming',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSyncStreamingMovies).not.toHaveBeenCalled();
    expect(mockDiscoverMovies).not.toHaveBeenCalled();
  });

  it('streamingレコードが0件の場合のみ、フォールバックとして同期する', async () => {
    const handler = await loadGET();

    setupStreamingFromMock({
      existingCount: 0,
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({
        time_frame: 'now_showing',
        release_type: 'streaming',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSyncStreamingMovies).toHaveBeenCalledTimes(1);
  });

  it('upcoming+streamingでもレコードが0件ならフォールバック同期が走る', async () => {
    const handler = await loadGET();

    setupStreamingFromMock({
      existingCount: 0,
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({
        time_frame: 'upcoming',
        release_type: 'streaming',
      }),
    );

    expect(response.status).toBe(200);
    expect(mockSyncStreamingMovies).toHaveBeenCalledTimes(1);
  });

  it('theatricalではstreamingのフォールバック同期を呼ばない', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(
      createRequest({ release_type: 'theatrical' }),
    );

    expect(response.status).toBe(200);
    expect(mockSyncStreamingMovies).not.toHaveBeenCalled();
  });

  // === 別release_typeとの共存（相互排他の撤廃） ===

  // === 複合パラメータ ===

  it('すべてのパラメータを同時に指定して正常に処理される', async () => {
    const handler = await loadGET();
    setupStreamingFromMock({
      countResult: { count: 10 },
      dataResult: { data: Array(10).fill({ id: 1 }), error: null },
    });

    const response = await handler(
      createRequest({
        page: '1',
        sort_by: 'popularity',
        sort_order: 'desc',
        release_type: 'streaming',
        time_frame: 'upcoming',
        genre_ids: '28,35',
        release_date_gte: '2026-06-01',
        release_date_lte: '2026-12-31',
        is_revival: 'false',
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data.pagination.totalItems).toBe(10);
  });

  // === お気に入り情報の付与 ===

  it('認証済みユーザーの場合、映画にfavoriteフィールドが付与される', async () => {
    const handler = await loadGET();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-123' } });

    const movies = [
      { id: 1, title: '映画A' },
      { id: 2, title: '映画B' },
    ];

    const callTracker = { count: 0 };
    mockSupabaseClient!.from.mockImplementation((table: string) => {
      callTracker.count++;

      if (table === 'favorites') {
        // お気に入りクエリ
        return createChainMock({
          data: [{ id: 'fav-1', tmdb_movie_id: 1, rating: 8 }],
          error: null,
        });
      }

      // 通常の映画クエリ
      const currentCall = callTracker.count;
      if (currentCall === 1) {
        return createChainMock({
          data: { cached_at: new Date().toISOString() },
          error: null,
        });
      }
      if (currentCall === 2) {
        // 件数とデータを1本で取る（#1272）
        const listResult = { data: movies, count: movies.length, error: null };
        const chain = createChainMock(listResult);
        chain.select.mockImplementation(
          (_cols: string, opts?: { count?: string }) => {
            if (opts?.count === 'exact') {
              return createThenableProxy(
                createChainMock(listResult),
                listResult,
              );
            }
            return createThenableProxy(
              createChainMock({ data: movies, error: null }),
              { data: movies, error: null },
            );
          },
        );
        return chain;
      }
      return createChainMock({ data: movies, error: null });
    });

    const response = await handler(createRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.movies[0].favorite).toEqual({ id: 'fav-1', rating: 8 });
    expect(json.data.movies[1].favorite).toBeNull();
  });

  /**
   * 読み取りに失敗したら全作品を「未登録」にしない（#1164）
   *
   * `error` を捨てると、DB の一時障害で**一覧の全作品**に
   * `favorite: null` が書かれる。空のハートが並び、押すと既存行と
   * 衝突して 409 になる。`movies/[id]` と同じ方針で 500 に倒す
   */
  it('お気に入りの読み取りに失敗したら、全作品を未登録にせず500を返す', async () => {
    const handler = await loadGET();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-123' } });

    const movies = [{ id: 1, title: '映画A' }];

    const callTracker = { count: 0 };
    mockSupabaseClient!.from.mockImplementation((table: string) => {
      callTracker.count++;

      if (table === 'favorites') {
        return createChainMock({
          data: null,
          error: { code: '57P01', message: 'connection terminated' },
        });
      }

      const currentCall = callTracker.count;
      if (currentCall === 1) {
        return createChainMock({
          data: { cached_at: new Date().toISOString() },
          error: null,
        });
      }
      if (currentCall === 2) {
        // 件数とデータを1本で取る（#1272）
        const listResult = { data: movies, count: movies.length, error: null };
        const chain = createChainMock(listResult);
        chain.select.mockImplementation(
          (_cols: string, opts?: { count?: string }) => {
            if (opts?.count === 'exact') {
              return createThenableProxy(
                createChainMock(listResult),
                listResult,
              );
            }
            return createThenableProxy(
              createChainMock({ data: movies, error: null }),
              { data: movies, error: null },
            );
          },
        );
        return chain;
      }
      return createChainMock({ data: movies, error: null });
    });

    const response = await handler(createRequest());

    expect(response.status).toBe(500);
  });

  // === Cache-Controlヘッダー ===

  it('未認証時はpublic Cache-Controlヘッダーが設定される', async () => {
    const handler = await loadGET();
    mockGetAuthSession.mockResolvedValue(null);
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(createRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(
      'public, s-maxage=3600, stale-while-revalidate=86400',
    );
  });

  it('認証済み時はprivate, no-store Cache-Controlヘッダーが設定される', async () => {
    const handler = await loadGET();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-123' } });
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(createRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('未認証の場合、映画にfavoriteフィールドが含まれない', async () => {
    const handler = await loadGET();
    mockGetAuthSession.mockResolvedValue(null);

    const movies = [{ id: 1, title: '映画A' }];

    setupFromMock({
      countResult: { count: 1 },
      dataResult: { data: movies, error: null },
    });

    const response = await handler(createRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.movies[0].favorite).toBeUndefined();
  });

  // === リバイバル作品の公開日保護 ===

  describe('地域フィルタの既定', () => {
    /** 原語に関する or 条件を1件取り出す（無ければ undefined） */
    const findLanguageOr = (): string | undefined =>
      collectFilterCalls('or')
        .map((args) => String(args[0]))
        .find((arg) => arg.includes('original_language'));

    /**
     * 除外対象の原語だけを取り出す
     *
     * or 条件全体に対する部分一致だと、`ta` が `original_language` に
     * 含まれるといった取り違えで通ってしまうため、リストを解析して突き合わせる
     */
    const findExcludedLanguages = (): string[] | undefined =>
      findLanguageOr()
        ?.match(/not\.in\.\(([^)]*)\)/)?.[1]
        .split(',');

    it('include_regions 未指定なら3グループの原語を除外する', async () => {
      const handler = await loadGET();
      setupExpiredCacheFromMock({
        countResult: { count: 0 },
        dataResult: { data: [], error: null },
      });

      await handler(createRequest());

      expect(findLanguageOr()).toContain('original_language.is.null');
      // TMDb 独自コードの広東語（cn）やインド諸語が抜けると、該当地域を
      // 未チェックのまま一覧に出てしまう（#881）
      expect(findExcludedLanguages()).toEqual(
        expect.arrayContaining([
          'ko',
          'zh',
          'cn',
          'th',
          'hi',
          'te',
          'ta',
          'ml',
          'kn',
          'mr',
          'bn',
          'pa',
          'gu',
        ]),
      );
    });

    it('中華圏を指定すれば北京語・広東語とも除外しない', async () => {
      const handler = await loadGET();
      setupExpiredCacheFromMock({
        countResult: { count: 0 },
        dataResult: { data: [], error: null },
      });

      await handler(createRequest({ include_regions: 'chinese' }));

      const excluded = findExcludedLanguages();
      expect(excluded).not.toContain('zh');
      expect(excluded).not.toContain('cn');
      expect(excluded).toContain('ko');
    });

    it('include_regions で指定した地域は除外しない', async () => {
      const handler = await loadGET();
      setupExpiredCacheFromMock({
        countResult: { count: 0 },
        dataResult: { data: [], error: null },
      });

      await handler(createRequest({ include_regions: 'korea' }));

      const excluded = findExcludedLanguages();
      expect(excluded).not.toContain('ko');
      expect(excluded).toContain('zh');
    });

    it('全地域を指定すれば言語で絞らない', async () => {
      const handler = await loadGET();
      setupExpiredCacheFromMock({
        countResult: { count: 0 },
        dataResult: { data: [], error: null },
      });

      await handler(
        createRequest({ include_regions: 'korea,chinese,thai_indian' }),
      );

      expect(findLanguageOr()).toBeUndefined();
    });
  });

  // === 舞台・演劇中継の除外 ===

  // === ライブ興行作品の除外 ===

  // === vote_count ===

  it('SELECTにvote_countが含まれ、レスポンスにそのまま返る', async () => {
    const handler = await loadGET();

    setupFromMock({
      countResult: { count: 1 },
      dataResult: {
        data: [{ id: 1, title: '映画A', vote_average: 7.5, vote_count: 1234 }],
        error: null,
      },
    });

    const response = await handler(createRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.movies[0].vote_count).toBe(1234);

    // ⚠️ from() の**何回目か**で決め打ちしない。#1272 で件数クエリが
    // 消えて呼び出し位置がずれた。`count: 'exact'` が付いた一覧クエリを
    // 記録しておき、その SELECT 句だけを見る
    expect(lastListSelect?.columns).toContain('vote_count');
  });

  describe('レート制限', () => {
    it('上限超過の場合は TMDb 同期を走らせずに 429 を返す', async () => {
      mockEnforcePublicRateLimit.mockResolvedValue(
        new Response(JSON.stringify({ success: false }), { status: 429 }),
      );

      const response = await GET(createRequest());

      expect(response.status).toBe(429);
      // キャッシュ失効時の同期は1回で200リクエスト規模になるため、
      // 外部から誘発できないよう手前で止める
      expect(mockSyncNowPlayingMovies).not.toHaveBeenCalled();
      expect(mockDiscoverMovies).not.toHaveBeenCalled();
    });

    it('認証済みはユーザーIDで数える', async () => {
      mockGetAuthSession.mockResolvedValue({ user: { id: 'user-123' } });

      await GET(createRequest());

      expect(mockEnforcePublicRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'read_api_movies',
          userId: 'user-123',
        }),
      );
    });

    describe('処理順', () => {
      // レート制限 → バリデーション（#940）。
      // 識別子はセッションか送信元IPなので検証より前に確定している。
      // 兄弟の `movies/search` と順序が逆だったのを揃えた
      // （`.claude/rules/api-route.md`）
      it('不正なクエリでもレート制限を消費する', async () => {
        const response = await GET(createRequest({ page: '-1' }));

        expect(response.status).toBe(400);
        expect(mockEnforcePublicRateLimit).toHaveBeenCalledTimes(1);
      });

      it('レート制限超過時は、クエリが不正でも429を返す', async () => {
        mockEnforcePublicRateLimit.mockResolvedValueOnce(
          new Response(JSON.stringify({ success: false }), { status: 429 }),
        );

        const response = await GET(createRequest({ page: '-1' }));

        expect(response.status).toBe(429);
      });
    });
  });
});
