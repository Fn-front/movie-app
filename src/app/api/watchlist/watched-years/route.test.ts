/**
 * @jest-environment node
 */

/**
 * 視聴済みの追加年一覧API Route テスト (GET)
 */

import { GET } from './route';

// --- Mocks ---

const mockRpc = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ rpc: mockRpc }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

jest.mock('@/helpers/auth', () => ({
  getAuthSession: jest.fn().mockResolvedValue({ user: { id: 'user-123' } }),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
}));

import { getAuthSession } from '@/helpers/auth';

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// --- Helpers ---

const createGetRequest = () =>
  new Request('http://localhost/api/watchlist/watched-years');

// --- Tests ---

describe('GET /api/watchlist/watched-years', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('視聴済みがある年を件数付きで返す', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        { added_year: 2025, watched_count: 3 },
        { added_year: 2024, watched_count: 12 },
      ],
      error: null,
    });

    const response = await GET(createGetRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.years).toEqual([
      { year: 2025, count: 3 },
      { year: 2024, count: 12 },
    ]);
  });

  it('ログイン中のユーザーIDでRPCを呼ぶ', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    await GET(createGetRequest());

    expect(mockRpc).toHaveBeenCalledWith('get_watchlist_watched_years', {
      p_user_id: 'user-123',
    });
  });

  it('視聴済みが1件も無いときは空配列を返す', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });

    const response = await GET(createGetRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.years).toEqual([]);
  });

  it('未認証なら401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(createGetRequest());

    expect(response.status).toBe(401);
  });

  it('レート制限を超えたら429を返す', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

    const response = await GET(createGetRequest());

    expect(response.status).toBe(429);
  });

  it('RPCが失敗したら500を返す', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'boom' },
    });

    const response = await GET(createGetRequest());

    expect(response.status).toBe(500);
  });
});
