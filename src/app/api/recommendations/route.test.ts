/**
 * @jest-environment node
 */

/**
 * レコメンド取得API Route テスト (GET)
 */

import { GET } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: jest.fn(() => ({ from: mockFrom })),
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

/** レコメンド取得のモック */
const mockRecommendationsQuery = (
  recs: Record<string, unknown>[],
  error: Error | null = null,
) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        order: () => Promise.resolve({ data: recs, error }),
      }),
    }),
  });
};

/** お気に入り件数取得のモック */
const mockFavoritesCountQuery = (count: number) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        is: () => Promise.resolve({ count, error: null }),
      }),
    }),
  });
};

// --- Tests ---

describe('GET /api/recommendations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('レコメンド一覧を取得できる', async () => {
    const mockRecs = [
      {
        id: 'rec-1',
        tmdb_movie_id: 100,
        title: 'メッセージ',
        poster_path: '/arrival.jpg',
        release_date: '2016-11-11',
        vote_average: 7.9,
        genre_ids: [878],
        reason: 'SF好きにおすすめ',
        display_order: 1,
        generated_at: '2026-03-15T03:00:00Z',
      },
      {
        id: 'rec-2',
        tmdb_movie_id: 200,
        title: 'インセプション',
        poster_path: '/inception.jpg',
        release_date: '2010-07-16',
        vote_average: 8.4,
        genre_ids: [878, 28],
        reason: 'SF映画好きにおすすめ',
        display_order: 2,
        generated_at: '2026-03-15T03:00:00Z',
      },
    ];

    mockRecommendationsQuery(mockRecs);
    mockFavoritesCountQuery(3);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.recommendations).toHaveLength(2);
    expect(json.data.generated_at).toBe('2026-03-15T03:00:00Z');
    expect(json.data.has_favorites).toBe(true);
  });

  it('レコメンドなしの場合、空配列とgenerated_at: nullを返す', async () => {
    mockRecommendationsQuery([]);
    mockFavoritesCountQuery(0);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.recommendations).toHaveLength(0);
    expect(json.data.generated_at).toBeNull();
    expect(json.data.has_favorites).toBe(false);
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it('DBエラー時に500を返す', async () => {
    mockRecommendationsQuery([], new Error('DB error'));
    mockFavoritesCountQuery(0);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('SERVER_ERROR');
  });

  it('DB接続エラーで500を返す', async () => {
    const { createServiceRoleClient } = await import('@/helpers/supabase');
    (createServiceRoleClient as jest.Mock).mockReturnValueOnce(null);

    const response = await GET();

    expect(response.status).toBe(500);
  });
});
