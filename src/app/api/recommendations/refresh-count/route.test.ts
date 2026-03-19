/**
 * @jest-environment node
 */

/**
 * レコメンド更新回数取得API Route テスト (GET /api/recommendations/refresh-count)
 */

import { GET } from './route';

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
  new Request('http://localhost/api/recommendations/refresh-count', {
    method: 'GET',
  });

// --- Tests ---

describe('GET /api/recommendations/refresh-count', () => {
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

  it('正常に回数情報を取得できる', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          gte: () => Promise.resolve({ count: 3, error: null }),
        }),
      }),
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.usedCount).toBe(3);
    expect(json.data.maxCount).toBe(10);
    expect(json.data.remainingCount).toBe(7);
  });

  it('0回使用時に正しく返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          gte: () => Promise.resolve({ count: 0, error: null }),
        }),
      }),
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.usedCount).toBe(0);
    expect(json.data.remainingCount).toBe(10);
  });

  it('上限到達時にremainingCountが0になる', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          gte: () => Promise.resolve({ count: 10, error: null }),
        }),
      }),
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.usedCount).toBe(10);
    expect(json.data.remainingCount).toBe(0);
  });

  it('DBエラー時に500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          gte: () =>
            Promise.resolve({ count: null, error: new Error('DB error') }),
        }),
      }),
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
  });

  it('countがnullの場合0として扱う', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          gte: () => Promise.resolve({ count: null, error: null }),
        }),
      }),
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.usedCount).toBe(0);
    expect(json.data.remainingCount).toBe(10);
  });
});
