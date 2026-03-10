/**
 * @jest-environment node
 */

/**
 * ウォッチリストAPI Route テスト (GET / POST)
 */

import { GET, POST } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

jest.mock('@/helpers/auth', () => ({
  getAuthSession: jest.fn().mockResolvedValue({ user: { id: 'user-123' } }),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
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

  it('ウォッチリスト一覧を取得できる', async () => {
    const mockItems = [
      {
        id: 'wl-1',
        tmdb_movie_id: 100,
        title: '映画A',
        poster_path: '/a.jpg',
        release_date: '2026-01-01',
        added_at: '2026-01-10T00:00:00Z',
      },
      {
        id: 'wl-2',
        tmdb_movie_id: 200,
        title: '映画B',
        poster_path: '/b.jpg',
        release_date: '2026-02-01',
        added_at: '2026-01-09T00:00:00Z',
      },
    ];

    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => ({
              limit: () => ({
                data: mockItems,
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.watchlist).toHaveLength(2);
    expect(json.data.has_more).toBe(false);
    expect(json.data.next_cursor).toBeNull();
  });

  it('カーソルベースページングが正しく動作する', async () => {
    // 21件返す → has_more = true
    const mockItems = Array.from({ length: 21 }, (_, i) => ({
      id: `wl-${i}`,
      tmdb_movie_id: i,
      title: `映画${i}`,
      poster_path: null,
      release_date: null,
      added_at: `2026-01-${String(20 - i).padStart(2, '0')}T00:00:00Z`,
    }));

    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => ({
              limit: () => ({
                data: mockItems,
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.watchlist).toHaveLength(20);
    expect(json.data.has_more).toBe(true);
    expect(json.data.next_cursor).toBe(json.data.watchlist[19].added_at);
  });

  it('カーソル指定で次ページを取得できる', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => ({
              limit: () => ({
                lt: () => ({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const response = await GET(
      createGetRequest({ cursor: '2026-01-05T00:00:00.000Z' }),
    );
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
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => ({
              limit: () => ({
                data: null,
                error: new Error('DB error'),
              }),
            }),
          }),
        }),
      }),
    });

    const response = await GET(createGetRequest());

    expect(response.status).toBe(500);
  });

  it('deleted_atがnullのレコードのみ取得する', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => ({
              limit: () => ({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.watchlist).toHaveLength(0);
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

  it('tmdb_movie_idが未指定で400を返す', async () => {
    const response = await POST(
      createPostRequest({
        title: 'テスト映画',
      }),
    );

    expect(response.status).toBe(400);
  });
});
