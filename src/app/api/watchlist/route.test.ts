/**
 * @jest-environment node
 */

/**
 * ウォッチリストAPI Route テスト (GET / POST)
 */

import { GET, POST } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
const mockRpc = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom, rpc: mockRpc }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

jest.mock('@/helpers/auth', () => ({
  getAuthSession: jest.fn().mockResolvedValue({ user: { id: 'user-123' } }),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
}));

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// 配信状況の初期化そのものは initMovieStreamingStatus.test.ts で見る。
// ここでは「追加後に呼ばれること」と「失敗しても追加が成功すること」だけ
const mockInitMovieStreamingStatus = jest.fn().mockResolvedValue('initialized');
jest.mock('@/lib/sync/initMovieStreamingStatus', () => ({
  initMovieStreamingStatus: (...args: unknown[]) =>
    mockInitMovieStreamingStatus(...args),
}));

import { getAuthSession } from '@/helpers/auth';

// --- Helpers ---

const createGetRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/watchlist');
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  return new Request(url.toString());
};

const createPostRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// --- Tests ---

describe('GET /api/watchlist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('ウォッチリスト一覧をRPC経由で取得できる', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'wl-1',
          tmdb_movie_id: 100,
          title: '映画A',
          poster_path: '/a.jpg',
          release_date: '2026-01-01',
          added_at: '2026-01-10T00:00:00Z',
          watched_at: null,
          total_count: 2,
        },
        {
          id: 'wl-2',
          tmdb_movie_id: 200,
          title: '映画B',
          poster_path: '/b.jpg',
          release_date: '2026-02-01',
          added_at: '2026-01-09T00:00:00Z',
          watched_at: '2026-03-01T00:00:00Z',
          total_count: 2,
        },
      ],
      error: null,
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.watchlist).toHaveLength(2);
    expect(json.data.has_more).toBe(false);
    expect(json.data.next_cursor).toBeNull();
  });

  it('視聴済みの日時を返す', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'wl-1',
          tmdb_movie_id: 100,
          title: '映画A',
          poster_path: null,
          release_date: null,
          added_at: '2026-01-10T00:00:00Z',
          watched_at: '2026-03-01T00:00:00Z',
          total_count: 1,
        },
      ],
      error: null,
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(json.data.watchlist[0].watched_at).toBe('2026-03-01T00:00:00Z');
  });

  it('total_countはレスポンスに含めない', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'wl-1',
          tmdb_movie_id: 100,
          title: '映画A',
          poster_path: null,
          release_date: null,
          added_at: '2026-01-10T00:00:00Z',
          watched_at: null,
          total_count: 1,
        },
      ],
      error: null,
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(json.data.watchlist[0]).not.toHaveProperty('total_count');
  });

  it('既定では追加日順・視聴済みを含めてRPCを呼ぶ', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(createGetRequest());

    expect(mockRpc).toHaveBeenCalledWith('get_watchlist_sorted', {
      p_user_id: 'user-123',
      p_sort: 'added_at',
      p_limit: 20,
      p_offset: 0,
      p_exclude_watched: false,
      // 既定は従来の並び。サイドバーがこの既定で呼ぶ
      p_prioritize_streaming: false,
      // 優先表示しないため設定は引かず、既定値を渡す
      p_streaming_scope: 'any',
    });
  });

  it('公開日が近い順を指定できる', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(createGetRequest({ sort: 'release_date_proximity' }));

    expect(mockRpc).toHaveBeenCalledWith(
      'get_watchlist_sorted',
      expect.objectContaining({ p_sort: 'release_date_proximity' }),
    );
  });

  it('exclude_watched=trueで視聴済みを除外する', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(createGetRequest({ exclude_watched: 'true' }));

    expect(mockRpc).toHaveBeenCalledWith(
      'get_watchlist_sorted',
      expect.objectContaining({ p_exclude_watched: true }),
    );
  });

  it('オフセットページングが正しく動作する', async () => {
    // 全40件中、先頭20件を返す
    mockRpc.mockResolvedValueOnce({
      data: Array.from({ length: 20 }, (_, i) => ({
        id: `wl-${i}`,
        tmdb_movie_id: i,
        title: `映画${i}`,
        poster_path: null,
        release_date: null,
        added_at: '2026-01-10T00:00:00Z',
        watched_at: null,
        total_count: 40,
      })),
      error: null,
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(json.data.watchlist).toHaveLength(20);
    expect(json.data.has_more).toBe(true);
    expect(json.data.next_cursor).toBe('20');
  });

  it('カーソル指定で次ページのオフセットを渡す', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(createGetRequest({ cursor: '20' }));

    expect(mockRpc).toHaveBeenCalledWith(
      'get_watchlist_sorted',
      expect.objectContaining({ p_offset: 20 }),
    );
  });

  it('最終ページではhas_moreがfalseになる', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        {
          id: 'wl-20',
          tmdb_movie_id: 20,
          title: '映画20',
          poster_path: null,
          release_date: null,
          added_at: '2026-01-10T00:00:00Z',
          watched_at: null,
          total_count: 21,
        },
      ],
      error: null,
    });

    const response = await GET(createGetRequest({ cursor: '20' }));
    const json = await response.json();

    expect(json.data.has_more).toBe(false);
    expect(json.data.next_cursor).toBeNull();
  });

  it('数値でないカーソルで400を返す', async () => {
    const response = await GET(createGetRequest({ cursor: 'not-a-number' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('0件のときは空配列を返す', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.watchlist).toHaveLength(0);
    expect(json.data.has_more).toBe(false);
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(createGetRequest());

    expect(response.status).toBe(401);
  });

  it('不正なlimitで400を返す', async () => {
    const response = await GET(createGetRequest({ limit: '100' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('DBエラー時に500を返す', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('DB error') });

    const response = await GET(createGetRequest());

    expect(response.status).toBe(500);
  });
});

describe('POST /api/watchlist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('ウォッチリストに正常に追加できる', async () => {
    // 重複チェック: 存在しない
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              single: () => ({
                data: null,
                error: { code: 'PGRST116' },
              }),
            }),
          }),
        }),
      }),
    });
    // INSERT成功
    mockFrom.mockReturnValueOnce({
      insert: () => ({
        select: () => ({
          single: () => ({
            data: {
              id: 'new-wl-id',
              tmdb_movie_id: 12345,
              title: 'テスト映画',
              poster_path: '/test.jpg',
              release_date: '2026-03-01',
              added_at: '2026-03-10T00:00:00Z',
            },
            error: null,
          }),
        }),
      }),
    });

    const response = await POST(
      createPostRequest({
        tmdb_movie_id: 12345,
        title: 'テスト映画',
        poster_path: '/test.jpg',
        release_date: '2026-03-01',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.tmdb_movie_id).toBe(12345);
  });

  it('重複時に409を返す', async () => {
    // 重複チェック: 存在する
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              single: () => ({
                data: { id: 'existing-id' },
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    const response = await POST(
      createPostRequest({
        tmdb_movie_id: 12345,
        title: 'テスト映画',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('CONFLICT');
  });

  it('バリデーションエラーで400を返す', async () => {
    const response = await POST(
      createPostRequest({
        tmdb_movie_id: -1,
        title: '',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      createPostRequest({
        tmdb_movie_id: 12345,
        title: 'テスト映画',
      }),
    );

    expect(response.status).toBe(401);
  });

  it('INSERT時にUNIQUE違反(23505)が発生したら409を返す', async () => {
    // 重複チェック: 存在しない（race: 直後に別リクエストが挿入した想定）
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              single: () => ({
                data: null,
                error: { code: 'PGRST116' },
              }),
            }),
          }),
        }),
      }),
    });
    // INSERT: UNIQUE violation
    mockFrom.mockReturnValueOnce({
      insert: () => ({
        select: () => ({
          single: () => ({
            data: null,
            error: { code: '23505', message: 'duplicate key' },
          }),
        }),
      }),
    });

    const response = await POST(
      createPostRequest({
        tmdb_movie_id: 12345,
        title: 'テスト映画',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('CONFLICT');
  });

  it('INSERTエラー時に500を返す', async () => {
    // 重複チェック: 存在しない
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              single: () => ({
                data: null,
                error: { code: 'PGRST116' },
              }),
            }),
          }),
        }),
      }),
    });
    // INSERT失敗
    mockFrom.mockReturnValueOnce({
      insert: () => ({
        select: () => ({
          single: () => ({
            data: null,
            error: new Error('Insert error'),
          }),
        }),
      }),
    });

    const response = await POST(
      createPostRequest({
        tmdb_movie_id: 12345,
        title: 'テスト映画',
      }),
    );

    expect(response.status).toBe(500);
  });

  it('不正なJSONで400を返す', async () => {
    const request = new Request('http://localhost/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json',
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('BAD_REQUEST');
  });

  it('tmdb_movie_idが未指定で400を返す', async () => {
    const response = await POST(
      createPostRequest({
        title: 'テスト映画',
      }),
    );

    expect(response.status).toBe(400);
  });

  it('レート制限超過時に429を返す', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 60,
    });

    const response = await POST(
      createPostRequest({
        tmdb_movie_id: 12345,
        title: 'テスト映画',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(json.error.details.retryAfter).toBe(60);
  });

  describe('処理順', () => {
    // 認証 → レート制限 → バリデーション（#940）。
    // 検証は `parseAndValidate` ヘルパー経由だが、順序の扱いは同じ
    // （`.claude/rules/api-route.md`）
    it('バリデーションエラー時もレート制限を消費する', async () => {
      const response = await POST(createPostRequest({}));

      expect(response.status).toBe(400);
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    });

    it('レート制限超過時は、ボディが不正でも429を返す', async () => {
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        retryAfter: 60,
      });

      const response = await POST(createPostRequest({}));

      expect(response.status).toBe(429);
    });
  });
});

/**
 * 配信バッジの元データ（movie_streaming_status）は日次 Cron でしか作られず、
 * 追加時点ですでに配信中の作品でも最長で約24時間バッジが出なかった（#942）。
 * 追加の経路でも埋める
 */
describe('POST /api/watchlist の配信状況の初期化', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockInitMovieStreamingStatus.mockResolvedValue('initialized');
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  /** 重複なし → INSERT 成功 のモックを積む */
  const mockSuccessfulInsert = () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              single: () => ({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
        }),
      }),
    });
    mockFrom.mockReturnValueOnce({
      insert: () => ({
        select: () => ({
          single: () => ({
            data: {
              id: 'new-wl-id',
              tmdb_movie_id: 12345,
              title: 'テスト映画',
              poster_path: null,
              release_date: null,
              added_at: '2026-03-10T00:00:00Z',
            },
            error: null,
          }),
        }),
      }),
    });
  };

  const addRequest = () =>
    createPostRequest({ tmdb_movie_id: 12345, title: 'テスト映画' });

  it('追加した作品のIDで初期化を呼ぶ', async () => {
    mockSuccessfulInsert();

    const response = await POST(addRequest());

    expect(response.status).toBe(201);
    // service role のクライアントが渡っていること。expect.anything() だと
    // 誤って別のオブジェクトを渡してもパスしてしまう
    expect(mockInitMovieStreamingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ from: mockFrom }),
      12345,
    );
  });

  // バッジが出ないだけで追加操作が失敗する方が困る
  it('初期化が失敗しても追加は成功する', async () => {
    mockSuccessfulInsert();
    mockInitMovieStreamingStatus.mockResolvedValue('failed');

    const response = await POST(addRequest());
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.tmdb_movie_id).toBe(12345);
  });

  it('重複で409になったときは初期化を呼ばない', async () => {
    // 重複チェック: 存在する
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              single: () => ({ data: { id: 'existing' }, error: null }),
            }),
          }),
        }),
      }),
    });

    const response = await POST(addRequest());

    expect(response.status).toBe(409);
    expect(mockInitMovieStreamingStatus).not.toHaveBeenCalled();
  });

  it('レート制限で止まったときは初期化を呼ばない', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 60,
    });

    const response = await POST(addRequest());

    expect(response.status).toBe(429);
    expect(mockInitMovieStreamingStatus).not.toHaveBeenCalled();
  });
});

describe('GET /api/watchlist の配信情報', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  /** RPC が返す1行を作る */
  const rpcRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'wl-1',
    tmdb_movie_id: 100,
    title: '映画A',
    poster_path: null,
    release_date: null,
    added_at: '2026-10-01T00:00:00Z',
    watched_at: null,
    streaming_offer_type: null,
    streaming_provider_ids: [],
    streaming_resumed: false,
    total_count: 1,
    ...overrides,
  });

  it('配信中のアイテムに streaming を付けて返す', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        rpcRow({
          streaming_offer_type: 'flatrate',
          streaming_provider_ids: [8, 84],
          streaming_resumed: false,
        }),
      ],
      error: null,
    });

    const response = await GET(createGetRequest());
    const body = await response.json();

    expect(body.data.watchlist[0].streaming).toEqual({
      offer_type: 'flatrate',
      provider_ids: [8, 84],
      resumed: false,
    });
  });

  it('配信なしのアイテムは streaming が null になる', async () => {
    mockRpc.mockResolvedValueOnce({ data: [rpcRow()], error: null });

    const response = await GET(createGetRequest());
    const body = await response.json();

    expect(body.data.watchlist[0].streaming).toBeNull();
  });

  it('再配信のフラグを引き継ぐ', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        rpcRow({
          streaming_offer_type: 'paid',
          streaming_provider_ids: [10],
          streaming_resumed: true,
        }),
      ],
      error: null,
    });

    const response = await GET(createGetRequest());
    const body = await response.json();

    expect(body.data.watchlist[0].streaming.resumed).toBe(true);
  });

  it('内部用の列をレスポンスに含めない', async () => {
    mockRpc.mockResolvedValueOnce({ data: [rpcRow()], error: null });

    const response = await GET(createGetRequest());
    const body = await response.json();

    const item = body.data.watchlist[0];
    expect(item).not.toHaveProperty('total_count');
    expect(item).not.toHaveProperty('streaming_offer_type');
    expect(item).not.toHaveProperty('streaming_provider_ids');
    expect(item).not.toHaveProperty('streaming_resumed');
  });

  it('prioritize_streaming=true を RPC に渡す', async () => {
    // 優先表示時は user_settings を引くためモックしておく
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    });
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(createGetRequest({ prioritize_streaming: 'true' }));

    expect(mockRpc).toHaveBeenCalledWith(
      'get_watchlist_sorted',
      expect.objectContaining({ p_prioritize_streaming: true }),
    );
  });

  it('prioritize_streaming 省略時は false を渡す', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(createGetRequest());

    expect(mockRpc).toHaveBeenCalledWith(
      'get_watchlist_sorted',
      expect.objectContaining({ p_prioritize_streaming: false }),
    );
  });
});

describe('配信範囲の設定', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  /** user_settings の取得をモックする */
  const mockUserSettings = (scope: string | null) => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: scope === null ? null : { streaming_notice_scope: scope },
              error: null,
            }),
        }),
      }),
    });
  };

  it('ユーザー設定を RPC に渡す', async () => {
    mockUserSettings('flatrate');
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(createGetRequest({ prioritize_streaming: 'true' }));

    expect(mockRpc).toHaveBeenCalledWith(
      'get_watchlist_sorted',
      expect.objectContaining({ p_streaming_scope: 'flatrate' }),
    );
  });

  it('設定が未作成なら any を渡す', async () => {
    mockUserSettings(null);
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(createGetRequest({ prioritize_streaming: 'true' }));

    expect(mockRpc).toHaveBeenCalledWith(
      'get_watchlist_sorted',
      expect.objectContaining({ p_streaming_scope: 'any' }),
    );
  });

  it('優先表示しないときは設定を引かない', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(createGetRequest());

    // サイドバーからの呼び出しで余計なクエリを増やさない
    expect(mockFrom).not.toHaveBeenCalledWith('user_settings');
    expect(mockRpc).toHaveBeenCalledWith(
      'get_watchlist_sorted',
      expect.objectContaining({ p_streaming_scope: 'any' }),
    );
  });
});

describe('見放題のみの設定でのバッジの絞り込み', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  /** user_settings の取得をモックする */
  const mockUserSettings = (scope: string | null) => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: scope === null ? null : { streaming_notice_scope: scope },
              error: null,
            }),
        }),
      }),
    });
  };

  /** RPC が返す1行を作る */
  const rpcRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'wl-1',
    tmdb_movie_id: 100,
    title: '映画A',
    poster_path: null,
    release_date: null,
    added_at: '2026-10-01T00:00:00Z',
    watched_at: null,
    streaming_offer_type: null,
    streaming_provider_ids: [],
    streaming_resumed: false,
    total_count: 1,
    ...overrides,
  });

  it('見放題のみの設定では、レンタルのみの作品に streaming を付けない', async () => {
    mockUserSettings('flatrate');
    mockRpc.mockResolvedValueOnce({
      data: [
        rpcRow({ streaming_offer_type: 'paid', streaming_provider_ids: [10] }),
      ],
      error: null,
    });

    const response = await GET(
      createGetRequest({ prioritize_streaming: 'true' }),
    );
    const body = await response.json();

    expect(body.data.watchlist[0].streaming).toBeNull();
  });

  it('見放題のみの設定でも、見放題の作品にはバッジを出す', async () => {
    mockUserSettings('flatrate');
    mockRpc.mockResolvedValueOnce({
      data: [
        rpcRow({
          streaming_offer_type: 'flatrate',
          streaming_provider_ids: [8],
        }),
      ],
      error: null,
    });

    const response = await GET(
      createGetRequest({ prioritize_streaming: 'true' }),
    );
    const body = await response.json();

    expect(body.data.watchlist[0].streaming).toEqual({
      offer_type: 'flatrate',
      provider_ids: [8],
      resumed: false,
    });
  });

  it('レンタルも含める設定なら、レンタルのバッジを出す', async () => {
    mockUserSettings('any');
    mockRpc.mockResolvedValueOnce({
      data: [
        rpcRow({ streaming_offer_type: 'paid', streaming_provider_ids: [10] }),
      ],
      error: null,
    });

    const response = await GET(
      createGetRequest({ prioritize_streaming: 'true' }),
    );
    const body = await response.json();

    expect(body.data.watchlist[0].streaming).toEqual({
      offer_type: 'paid',
      provider_ids: [10],
      resumed: false,
    });
  });

  it('優先表示しない呼び出し（サイドバー）では絞り込まない', async () => {
    // 設定を引かないので範囲は既定の any のまま。
    // サイドバーはバッジ自体を描画しないため実害は無いが、
    // 「設定を引いていないのに絞る」という不整合を作らない
    mockRpc.mockResolvedValueOnce({
      data: [
        rpcRow({ streaming_offer_type: 'paid', streaming_provider_ids: [10] }),
      ],
      error: null,
    });

    const response = await GET(createGetRequest());
    const body = await response.json();

    expect(body.data.watchlist[0].streaming).not.toBeNull();
  });
});
