/**
 * @jest-environment node
 */

/**
 * 映画一覧API Route テスト
 */

// --- Mocks ---

// genreCacheをリセットするために、モジュールを都度リロード
let GET: typeof import('./route').GET;

const mockSyncNowPlayingMovies = jest.fn().mockResolvedValue({ synced: 0 });
jest.mock('@/lib/sync/syncNowPlayingMovies', () => ({
  syncNowPlayingMovies: (...args: unknown[]) =>
    mockSyncNowPlayingMovies(...args),
}));

const mockDiscoverMovies = jest.fn().mockResolvedValue({
  results: [],
  total_pages: 0,
});
const mockGetGenres = jest.fn().mockResolvedValue([
  { id: 28, name: 'アクション' },
  { id: 35, name: 'コメディ' },
]);
jest.mock('@/lib/tmdb/tmdb', () => ({
  discoverMovies: (...args: unknown[]) => mockDiscoverMovies(...args),
  getGenres: (...args: unknown[]) => mockGetGenres(...args),
}));

/**
 * Supabaseチェイン可能なクエリビルダーのモックを作成
 */
function createChainMock(resolveValue: unknown = { data: null, error: null }) {
  const chain: Record<string, jest.Mock> = {};
  const methods = [
    'select',
    'eq',
    'neq',
    'order',
    'limit',
    'single',
    'range',
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

let mockSupabaseClient: { from: jest.Mock } | null;
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

// --- Helpers ---

const createRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/movies');
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  return new Request(url.toString());
};

/**
 * 標準のfromモック設定を構築
 * cacheResult: キャッシュクエリの結果
 * countResult: カウントクエリの結果
 * dataResult: データクエリの結果
 * existingOtherType: 他のrelease_typeで既存のID
 */
function setupFromMock(options: {
  cacheResult?: { data: unknown; error: unknown };
  countResult?: { count: number };
  dataResult?: { data: unknown[]; error: unknown };
  existingOtherType?: { data: unknown[]; error: unknown };
}) {
  const {
    cacheResult = {
      data: { cached_at: new Date().toISOString() },
      error: null,
    },
    countResult = { count: 0 },
    dataResult = { data: [], error: null },
    existingOtherType = { data: [], error: null },
  } = options;

  const callTracker = { count: 0 };

  mockSupabaseClient!.from.mockImplementation(() => {
    callTracker.count++;
    const currentCall = callTracker.count;

    if (currentCall === 1) {
      // キャッシュチェッククエリ
      return createChainMock(cacheResult);
    }
    if (currentCall === 2) {
      // カウントクエリ or 他release_type既存IDクエリ
      // selectのoptsを見て判定
      const chain = createChainMock(countResult);
      chain.select.mockImplementation(
        (_cols: string, opts?: { count?: string }) => {
          if (opts?.count === 'exact') {
            const countProxy = createChainMock(countResult);
            return createThenableProxy(countProxy, countResult);
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
    if (currentCall === 3) {
      // データクエリ
      return createChainMock(dataResult);
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
 */
function setupNowPlayingFromMock(options: {
  cacheResult?: { data: unknown; error: unknown };
  countResult?: { count: number };
  dataResult?: { data: unknown[]; error: unknown };
}) {
  const {
    cacheResult = {
      data: { cached_at: new Date().toISOString() },
      error: null,
    },
    countResult = { count: 0 },
    dataResult = { data: [], error: null },
  } = options;

  const callTracker = { count: 0 };

  mockSupabaseClient!.from.mockImplementation(() => {
    callTracker.count++;
    const currentCall = callTracker.count;

    if (currentCall === 1) {
      // キャッシュチェッククエリ (is_now_playing用)
      return createChainMock(cacheResult);
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
    if (currentCall === 2) {
      // 他release_typeの既存IDクエリ（neq）
      const chain = createChainMock({ data: [], error: null });
      chain.select.mockImplementation(() => {
        return createThenableProxy(createChainMock({ data: [], error: null }), {
          data: [],
          error: null,
        });
      });
      return chain;
    }
    // TMDb結果のupsert
    if (discoverResults.length > 0 && currentCall <= 2 + 5) {
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
    // genreCacheをリセットするためにモジュールをリロード
    jest.resetModules();

    // Supabaseクライアントをデフォルトで有効化
    mockSupabaseClient = { from: jest.fn() };
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
    expect(json.error.message).toBe('クエリパラメータが不正です。');
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

  it('空のgenre_idsの場合、フィルタなしで処理される', async () => {
    const handler = await loadGET();
    setupFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(createRequest({ genre_ids: '' }));
    expect(response.status).toBe(200);
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

  // === now_showing + theatrical パス ===

  it('now_showing+theatricalでキャッシュが有効な場合、syncを呼ばない', async () => {
    const handler = await loadGET();
    setupNowPlayingFromMock({
      cacheResult: {
        data: { cached_at: new Date().toISOString() },
        error: null,
      },
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

  it('now_showing+theatricalでキャッシュが期限切れの場合、syncを呼ぶ', async () => {
    const handler = await loadGET();
    const expiredDate = new Date();
    expiredDate.setHours(expiredDate.getHours() - 25); // 24時間超過

    setupNowPlayingFromMock({
      cacheResult: {
        data: { cached_at: expiredDate.toISOString() },
        error: null,
      },
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

  it('now_showing+theatricalでキャッシュが存在しない場合、syncを呼ぶ', async () => {
    const handler = await loadGET();
    setupNowPlayingFromMock({
      cacheResult: { data: null, error: null },
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

  it('now_showing+streamingでキャッシュ有効の場合、discoverを呼ばない', async () => {
    const handler = await loadGET();
    setupFromMock({
      cacheResult: {
        data: { cached_at: new Date().toISOString() },
        error: null,
      },
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
  });

  it('now_showing+streamingでrelease_date_gteが範囲内の場合、ユーザー指定値が使われる', async () => {
    const handler = await loadGET();
    // 未来の日付を指定して、デフォルトのgteDateより大きくする
    const futureGte = '2026-03-08';
    setupFromMock({
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
    setupFromMock({
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

  // === upcoming + theatrical (キャッシュ期限切れでDiscover API呼び出し) ===

  it('キャッシュ期限切れ時にTMDb Discover APIを呼び出す', async () => {
    const handler = await loadGET();

    mockDiscoverMovies.mockResolvedValue({
      results: [
        {
          id: 100,
          title: 'テスト映画',
          adult: false,
          original_language: 'ja',
          genre_ids: [28],
          vote_average: 7.0,
          popularity: 50,
          poster_path: '/test.jpg',
          backdrop_path: '/backdrop.jpg',
          release_date: '2026-05-01',
          overview: 'テスト概要',
        },
      ],
      total_pages: 1,
    });

    setupExpiredCacheFromMock({
      countResult: { count: 1 },
      dataResult: {
        data: [{ id: 100, title: 'テスト映画' }],
        error: null,
      },
    });

    const response = await handler(createRequest());
    expect(response.status).toBe(200);
    expect(mockDiscoverMovies).toHaveBeenCalled();
  });

  it('TMDb APIの結果が空の場合、ループを中断する', async () => {
    const handler = await loadGET();

    mockDiscoverMovies.mockResolvedValue({
      results: [],
      total_pages: 0,
    });

    setupExpiredCacheFromMock({
      countResult: { count: 0 },
      dataResult: { data: [], error: null },
    });

    const response = await handler(createRequest());
    expect(response.status).toBe(200);
    // 1回だけ呼ばれ、空だったのでループ中断
    expect(mockDiscoverMovies).toHaveBeenCalledTimes(1);
  });

  it('adultコンテンツが除外される', async () => {
    const handler = await loadGET();

    mockDiscoverMovies.mockResolvedValueOnce({
      results: [
        {
          id: 200,
          title: 'アダルト映画',
          adult: true,
          original_language: 'ja',
          genre_ids: [28],
          vote_average: 5.0,
          popularity: 10,
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

  it('除外言語の映画が除外される', async () => {
    const handler = await loadGET();

    mockDiscoverMovies.mockResolvedValueOnce({
      results: [
        {
          id: 201,
          title: '韓国映画',
          adult: false,
          original_language: 'ko',
          genre_ids: [28],
          vote_average: 7.0,
          popularity: 50,
        },
        {
          id: 202,
          title: '中国映画',
          adult: false,
          original_language: 'zh',
          genre_ids: [35],
          vote_average: 6.0,
          popularity: 30,
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

  it('genre_idsが空の映画が除外される', async () => {
    const handler = await loadGET();

    mockDiscoverMovies.mockResolvedValueOnce({
      results: [
        {
          id: 203,
          title: 'ジャンルなし映画',
          adult: false,
          original_language: 'ja',
          genre_ids: [],
          vote_average: 7.0,
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

  it('別のrelease_typeで既に存在するIDの映画が除外される', async () => {
    const handler = await loadGET();

    mockDiscoverMovies.mockResolvedValueOnce({
      results: [
        {
          id: 300,
          title: '重複映画',
          adult: false,
          original_language: 'ja',
          genre_ids: [28],
          vote_average: 7.0,
          popularity: 50,
        },
      ],
      total_pages: 1,
    });

    // 既にstreaming側にid=300が存在
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
    setupFromMock({
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
    expect(json.error.message).toBe(
      '映画データの取得中にエラーが発生しました。',
    );
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

  // === ジャンルキャッシュ ===

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

  it('2回目のリクエストではジャンルキャッシュが使われる', async () => {
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

    // getGenresは1回だけ呼ばれる（キャッシュ使用）
    expect(mockGetGenres).toHaveBeenCalledTimes(1);
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

  // === now_showing + streaming キャッシュ期限切れ (Discover APIフロー) ===

  it('now_showing+streamingでキャッシュ期限切れの場合、Discover APIを呼び出す（過去日付範囲）', async () => {
    const handler = await loadGET();

    mockDiscoverMovies.mockResolvedValueOnce({
      results: [
        {
          id: 400,
          title: 'ストリーミング映画',
          adult: false,
          original_language: 'ja',
          genre_ids: [28],
          vote_average: 7.0,
          popularity: 50,
          poster_path: '/test.jpg',
          backdrop_path: '/backdrop.jpg',
          release_date: '2026-02-01',
          overview: 'テスト',
        },
      ],
      total_pages: 1,
    });

    setupExpiredCacheFromMock({
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
    expect(mockDiscoverMovies).toHaveBeenCalled();
    // now_showing+streamingでは過去の日付範囲(release_date.gte)が使われる
    const callArgs = mockDiscoverMovies.mock.calls[0][0];
    expect(callArgs['release_date.lte']).toBeDefined();
    expect(callArgs['release_date.gte']).toBeDefined();
  });

  // === 既存他release_typeのIDが存在する場合の重複除外 ===

  it('キャッシュ期限切れ時に既存他release_typeのIDが存在する場合、重複が除外される', async () => {
    const handler = await loadGET();

    mockDiscoverMovies.mockResolvedValueOnce({
      results: [
        {
          id: 500,
          title: '重複映画',
          adult: false,
          original_language: 'ja',
          genre_ids: [28],
          vote_average: 7.0,
          popularity: 50,
          poster_path: '/test.jpg',
          backdrop_path: null,
          release_date: '2026-05-01',
          overview: '',
        },
        {
          id: 501,
          title: '新規映画',
          adult: false,
          original_language: 'ja',
          genre_ids: [35],
          vote_average: 6.0,
          popularity: 30,
          poster_path: '/new.jpg',
          backdrop_path: null,
          release_date: '2026-06-01',
          overview: 'テスト',
        },
      ],
      total_pages: 1,
    });

    // 既にstreaming側にid=500が存在するモック
    const callTracker = { count: 0 };
    mockSupabaseClient!.from.mockImplementation(() => {
      callTracker.count++;
      const currentCall = callTracker.count;

      if (currentCall === 1) {
        // キャッシュチェック → 期限切れ
        return createChainMock({ data: null, error: null });
      }
      if (currentCall === 2) {
        // 他release_typeの既存IDクエリ → id=500が存在
        const chain = createChainMock({ data: [{ id: 500 }], error: null });
        chain.select.mockImplementation(() => {
          return createThenableProxy(
            createChainMock({ data: [{ id: 500 }], error: null }),
            { data: [{ id: 500 }], error: null },
          );
        });
        return chain;
      }
      // upsert, count, data クエリ
      const chain = createChainMock({
        count: 1,
        data: [{ id: 501 }],
        error: null,
      });
      chain.select.mockImplementation(
        (_cols: string, opts?: { count?: string }) => {
          if (opts?.count === 'exact') {
            return createThenableProxy(createChainMock({ count: 1 }), {
              count: 1,
            });
          }
          return createThenableProxy(
            createChainMock({ data: [{ id: 501 }], error: null }),
            { data: [{ id: 501 }], error: null },
          );
        },
      );
      return chain;
    });

    const response = await handler(createRequest());
    expect(response.status).toBe(200);
    expect(mockDiscoverMovies).toHaveBeenCalled();
  });

  // === 複合パラメータ ===

  it('すべてのパラメータを同時に指定して正常に処理される', async () => {
    const handler = await loadGET();
    setupFromMock({
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
});
