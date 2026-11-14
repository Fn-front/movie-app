/**
 * @jest-environment node
 */

/**
 * レコメンド一覧取得API Route テスト (GET /api/recommendations)
 */

import { GET } from './route';

// --- Mocks ---

const mockSupabase = { from: jest.fn() };
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => mockSupabase,
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

const mockFetchRecommendationData = jest.fn();
jest.mock('@/lib/api/recommendations/recommendationData', () => ({
  fetchRecommendationData: (...args: unknown[]) =>
    mockFetchRecommendationData(...args),
}));

import { getAuthSession } from '@/helpers/auth';
import { RATE_LIMIT_ACTION, RATE_LIMIT_CONFIG } from '@/constants';

// --- Helpers ---

const createGetRequest = () =>
  new Request('http://localhost/api/recommendations', { method: 'GET' });

const sampleData = {
  recommendations: [
    {
      id: 'rec-1',
      tmdb_movie_id: 101,
      title: 'おすすめ映画',
      poster_path: null,
      release_date: '2026-01-01',
      vote_average: 8,
      vote_count: 100,
      genre_ids: [28],
      reason: '理由',
      display_order: 1,
    },
  ],
  generatedAt: '2026-01-01T00:00:00.000Z',
  hasFavorites: true,
};

// --- Tests ---

describe('GET /api/recommendations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockFetchRecommendationData.mockResolvedValue(sampleData);
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(createGetRequest());

    expect(response.status).toBe(401);
    expect(mockFetchRecommendationData).not.toHaveBeenCalled();
  });

  it('認証済みならレコメンドを返す', async () => {
    const response = await GET(createGetRequest());

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ success: true, data: sampleData });
    expect(mockFetchRecommendationData).toHaveBeenCalledWith(
      mockSupabase,
      'user-123',
    );
  });

  // 他の認証必須の読み取りと同じカウンタを共有する
  it('READ_USER_DATA のレート制限を掛ける', async () => {
    await GET(createGetRequest());

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      mockSupabase,
      'user-123',
      RATE_LIMIT_ACTION.READ_USER_DATA,
      RATE_LIMIT_CONFIG.READ_USER_DATA.maxAttempts,
      RATE_LIMIT_CONFIG.READ_USER_DATA.windowMinutes,
    );
  });

  it('レート制限を超えていたら429を返す', async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await GET(createGetRequest());

    expect(response.status).toBe(429);
  });

  /**
   * 処理順（`.claude/rules/api-route.md`）
   *
   * このルートに入力の検証は無いが、**DB へ触る前に**制限を掛けること。
   * 後ろに置くと、超過していても毎回クエリが走る
   */
  describe('処理順', () => {
    it('レート制限超過のときはDBを引かない', async () => {
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await GET(createGetRequest());

      expect(mockFetchRecommendationData).not.toHaveBeenCalled();
    });
  });

  it('取得で例外が出たら500を返す', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetchRecommendationData.mockRejectedValue(new Error('boom'));

    const response = await GET(createGetRequest());

    expect(response.status).toBe(500);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
