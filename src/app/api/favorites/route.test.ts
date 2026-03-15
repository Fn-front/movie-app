/**
 * @jest-environment node
 */

/**
 * お気に入りAPI Route テスト (GET / POST)
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
  const url = new URL('http://localhost/api/favorites');
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  return new Request(url.toString());
};

const createPostRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// --- Tests ---

describe('GET /api/favorites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('お気に入り一覧を取得できる', async () => {
    const mockItems = [
      {
        id: 'fav-1',
        tmdb_movie_id: 100,
        title: '映画A',
        poster_path: '/a.jpg',
        release_date: '2026-01-01',
        rating: 8,
        added_at: '2026-01-10T00:00:00Z',
      },
      {
        id: 'fav-2',
        tmdb_movie_id: 200,
        title: '映画B',
        poster_path: '/b.jpg',
        release_date: '2026-02-01',
        rating: 6,
        added_at: '2026-01-09T00:00:00Z',
      },
    ];

    // 件数取得
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          is: () => ({
            count: 2,
            error: null,
          }),
        }),
      }),
    });
    // データ取得
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => ({
              range: () => ({
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
    expect(json.data.favorites).toHaveLength(2);
    expect(json.data.pagination).toEqual({
      currentPage: 1,
      totalPages: 1,
      totalItems: 2,
      itemsPerPage: 20,
      hasNextPage: false,
      nextPage: null,
    });
  });

  it('ソートとページ指定で取得できる', async () => {
    // 件数取得
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          is: () => ({
            count: 0,
            error: null,
          }),
        }),
      }),
    });
    // データ取得
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => ({
              range: () => ({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      }),
    });

    const response = await GET(
      createGetRequest({ sort_by: 'rating', sort_order: 'asc', page: '2' }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.favorites).toHaveLength(0);
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(createGetRequest());

    expect(response.status).toBe(401);
  });

  it('不正なsort_byで400を返す', async () => {
    const response = await GET(createGetRequest({ sort_by: 'invalid' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('不正なlimitで400を返す', async () => {
    const response = await GET(createGetRequest({ limit: '100' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('DBエラー時に500を返す', async () => {
    // 件数取得でエラー
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          is: () => ({
            count: null,
            error: new Error('DB error'),
          }),
        }),
      }),
    });

    const response = await GET(createGetRequest());

    expect(response.status).toBe(500);
  });
});

describe('POST /api/favorites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('お気に入りに正常に追加できる', async () => {
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
              id: 'new-fav-id',
              tmdb_movie_id: 12345,
              title: 'テスト映画',
              poster_path: '/test.jpg',
              release_date: '2026-03-01',
              rating: 8,
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
        rating: 8,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.tmdb_movie_id).toBe(12345);
    expect(json.data.rating).toBe(8);
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
        rating: 8,
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
        rating: 0,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('ratingが範囲外で400を返す', async () => {
    const response = await POST(
      createPostRequest({
        tmdb_movie_id: 12345,
        title: 'テスト映画',
        rating: 11,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      createPostRequest({
        tmdb_movie_id: 12345,
        title: 'テスト映画',
        rating: 8,
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
        rating: 8,
      }),
    );

    expect(response.status).toBe(500);
  });

  it('不正なJSONで400を返す', async () => {
    const request = new Request('http://localhost/api/favorites', {
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

  it('ratingが未指定で400を返す', async () => {
    const response = await POST(
      createPostRequest({
        tmdb_movie_id: 12345,
        title: 'テスト映画',
      }),
    );

    expect(response.status).toBe(400);
  });
});
