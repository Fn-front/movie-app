/**
 * @jest-environment node
 */

/**
 * レコメンド手動更新API Route テスト (POST /api/recommendations/refresh)
 */

import { POST } from './route';

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

const mockProcessUserRecommendations = jest.fn();
jest.mock('@/lib/recommendations/generateRecommendationsService', () => ({
  processUserRecommendations: (...args: unknown[]) =>
    mockProcessUserRecommendations(...args),
}));

import { getAuthSession } from '@/helpers/auth';

// --- Helpers ---

const createPostRequest = () =>
  new Request('http://localhost/api/recommendations/refresh', {
    method: 'POST',
  });

/**
 * 当月回数カウント用のSupabaseチェーンモック
 */
function mockCountChain(count: number) {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        gte: () => Promise.resolve({ count, error: null }),
      }),
    }),
  });
}

/**
 * INSERT成功用モック
 */
function mockInsertSuccess() {
  mockFrom.mockReturnValueOnce({
    insert: () => Promise.resolve({ error: null }),
  });
}

/**
 * レコメンド取得用モック
 */
function mockFetchRecommendations(data: Record<string, unknown>[]) {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve({ data, error: null }),
      }),
    }),
  });
}

// --- Tests ---

describe('POST /api/recommendations/refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await POST(createPostRequest());

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('上限到達時に429を返す', async () => {
    mockCountChain(10);

    const response = await POST(createPostRequest());
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('REFRESH_LIMIT_EXCEEDED');
  });

  it('正常にレコメンドを更新できる', async () => {
    const mockRecommendations = [
      {
        id: 'rec-1',
        tmdb_movie_id: 100,
        title: 'テスト映画',
        poster_path: '/poster.jpg',
        release_date: '2025-01-01',
        vote_average: 8.5,
        genre_ids: [28],
        reason: 'テスト理由',
        display_order: 1,
      },
    ];

    // 1. カウントチェック（0回使用済み）
    mockCountChain(0);
    // 2. processUserRecommendations成功
    mockProcessUserRecommendations.mockResolvedValueOnce({
      status: 'processed',
      recommendationCount: 1,
    });
    // 3. INSERT成功（生成成功後にカウント記録）
    mockInsertSuccess();
    // 4. レコメンド取得
    mockFetchRecommendations(mockRecommendations);

    const response = await POST(createPostRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.remainingCount).toBe(9);
    expect(json.data.recommendations).toHaveLength(1);
    expect(json.data.recommendations[0].title).toBe('テスト映画');
  });

  it('レコメンド生成がskippedの場合に500を返す（カウント未消費）', async () => {
    mockCountChain(0);
    mockProcessUserRecommendations.mockResolvedValueOnce({
      status: 'skipped',
      recommendationCount: 0,
    });

    const response = await POST(createPostRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('GENERATION_FAILED');
  });

  it('カウント取得時のDBエラーで500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          gte: () =>
            Promise.resolve({ count: null, error: new Error('DB error') }),
        }),
      }),
    });

    const response = await POST(createPostRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
  });

  it('INSERT時のDBエラーで500を返す', async () => {
    mockCountChain(0);
    mockProcessUserRecommendations.mockResolvedValueOnce({
      status: 'processed',
      recommendationCount: 10,
    });
    mockFrom.mockReturnValueOnce({
      insert: () => Promise.resolve({ error: new Error('Insert error') }),
    });

    const response = await POST(createPostRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
  });

  it('残り回数が正しく計算される（5回使用済み→残り4回）', async () => {
    mockCountChain(5);
    mockProcessUserRecommendations.mockResolvedValueOnce({
      status: 'processed',
      recommendationCount: 10,
    });
    mockInsertSuccess();
    mockFetchRecommendations([]);

    const response = await POST(createPostRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.remainingCount).toBe(4);
  });
});
