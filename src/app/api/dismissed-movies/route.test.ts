/**
 * @jest-environment node
 */

/**
 * 興味なしAPI Route テスト (GET / POST / DELETE)
 */

import { GET, POST, DELETE } from './route';

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

const createGetRequest = () =>
  new Request('http://localhost/api/dismissed-movies', { method: 'GET' });

const createPostRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/dismissed-movies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const createDeleteRequest = (tmdbMovieId?: string) => {
  const url = new URL('http://localhost/api/dismissed-movies');
  if (tmdbMovieId) url.searchParams.set('tmdb_movie_id', tmdbMovieId);
  return new Request(url.toString(), { method: 'DELETE' });
};

// --- Tests ---

describe('GET /api/dismissed-movies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(createGetRequest());

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('正常に興味なし一覧を取得できる', async () => {
    const mockData = [
      {
        id: 'dismissed-1',
        tmdb_movie_id: 12345,
        title: 'テスト映画1',
        poster_path: '/poster1.jpg',
        genre_ids: [28, 12],
        created_at: '2026-03-10T00:00:00Z',
      },
      {
        id: 'dismissed-2',
        tmdb_movie_id: 67890,
        title: 'テスト映画2',
        poster_path: '/poster2.jpg',
        genre_ids: [18],
        created_at: '2026-03-09T00:00:00Z',
      },
    ];

    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => Promise.resolve({ data: mockData, error: null }),
          }),
        }),
      }),
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].tmdb_movie_id).toBe(12345);
    expect(json.data[1].tmdb_movie_id).toBe(67890);
  });

  it('レコードがない場合は空配列を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual([]);
  });

  it('DBエラー時に500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () =>
              Promise.resolve({ data: null, error: new Error('DB error') }),
          }),
        }),
      }),
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('SERVER_ERROR');
  });

  it('DB接続エラー時に500を返す', async () => {
    // createServiceRoleClientがnullを返すケースをシミュレート
    const originalMock = jest.requireMock('@/helpers/supabase');
    const originalFn = originalMock.createServiceRoleClient;
    originalMock.createServiceRoleClient = () => null;

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);

    // モックを元に戻す
    originalMock.createServiceRoleClient = originalFn;
  });
});

describe('POST /api/dismissed-movies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('正常に興味なしに追加できる', async () => {
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
              id: 'dismissed-1',
              tmdb_movie_id: 12345,
              title: 'テスト映画',
              genre_ids: [28, 12],
              created_at: '2026-03-10T00:00:00Z',
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
        genre_ids: [28, 12],
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.tmdb_movie_id).toBe(12345);
    expect(json.data.title).toBe('テスト映画');
    expect(json.data.genre_ids).toEqual([28, 12]);
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

  it('不正なJSONで400を返す', async () => {
    const request = new Request('http://localhost/api/dismissed-movies', {
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
});

describe('DELETE /api/dismissed-movies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('正常に興味なしから削除できる', async () => {
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              error: null,
            }),
          }),
        }),
      }),
    });

    const response = await DELETE(createDeleteRequest('12345'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('tmdb_movie_idが未指定で400を返す', async () => {
    const response = await DELETE(createDeleteRequest());
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('BAD_REQUEST');
  });

  it('tmdb_movie_idが不正な値で400を返す', async () => {
    const response = await DELETE(createDeleteRequest('abc'));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('BAD_REQUEST');
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await DELETE(createDeleteRequest('12345'));

    expect(response.status).toBe(401);
  });

  it('UPDATEエラー時に500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: jest.fn().mockReturnValue({
          eq: () => ({
            is: () => ({
              error: new Error('Update error'),
            }),
          }),
        }),
      }),
    });

    const response = await DELETE(createDeleteRequest('12345'));

    expect(response.status).toBe(500);
  });
});
