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
});
