/**
 * @jest-environment node
 */

/**
 * レコメンドデータ取得（サーバーサイド用）テスト
 */

import { getRecommendations } from './recommendations.server';

// --- Mocks ---

const mockAuth = jest.fn();
jest.mock('@/lib/auth/auth', () => ({
  auth: () => mockAuth(),
}));

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: jest.fn(() => ({ from: mockFrom })),
}));

// --- Helpers ---

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

const mockFavoritesCountQuery = (count: number) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        is: () => Promise.resolve({ count, error: null }),
      }),
    }),
  });
};

const mockDismissedMoviesQuery = (dismissedIds: number[] = []) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        is: () =>
          Promise.resolve({
            data: dismissedIds.map((id) => ({ tmdb_movie_id: id })),
            error: null,
          }),
      }),
    }),
  });
};

// --- Tests ---

describe('getRecommendations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'user-123' } });
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
    ];

    mockRecommendationsQuery(mockRecs);
    mockFavoritesCountQuery(3);
    mockDismissedMoviesQuery([]);

    const result = await getRecommendations();

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].title).toBe('メッセージ');
    expect(result.generatedAt).toBe('2026-03-15T03:00:00Z');
    expect(result.hasFavorites).toBe(true);
  });

  it('レコメンドなしの場合、空配列を返す', async () => {
    mockRecommendationsQuery([]);
    mockFavoritesCountQuery(0);
    mockDismissedMoviesQuery([]);

    const result = await getRecommendations();

    expect(result.recommendations).toHaveLength(0);
    expect(result.generatedAt).toBeNull();
    expect(result.hasFavorites).toBe(false);
  });

  it('未ログイン時は空のデータを返す', async () => {
    mockAuth.mockResolvedValue(null);

    const result = await getRecommendations();

    expect(result.recommendations).toEqual([]);
    expect(result.generatedAt).toBeNull();
    expect(result.hasFavorites).toBe(false);
  });

  it('DBエラー時は空のデータを返す', async () => {
    mockRecommendationsQuery([], new Error('DB error'));
    mockFavoritesCountQuery(0);
    mockDismissedMoviesQuery([]);

    const result = await getRecommendations();

    expect(result.recommendations).toEqual([]);
    expect(result.generatedAt).toBeNull();
    expect(result.hasFavorites).toBe(false);
  });

  it('DB接続エラー時は空のデータを返す', async () => {
    const { createServiceRoleClient } = await import('@/helpers/supabase');
    (createServiceRoleClient as jest.Mock).mockReturnValueOnce(null);

    const result = await getRecommendations();

    expect(result.recommendations).toEqual([]);
    expect(result.generatedAt).toBeNull();
    expect(result.hasFavorites).toBe(false);
  });

  it('お気に入りが1件以上ある場合hasFavoritesがtrue', async () => {
    mockRecommendationsQuery([]);
    mockFavoritesCountQuery(5);
    mockDismissedMoviesQuery([]);

    const result = await getRecommendations();

    expect(result.hasFavorites).toBe(true);
  });

  it('興味なし登録済みの映画がフィルタリングされる', async () => {
    const mockRecs = [
      {
        id: 'rec-1',
        tmdb_movie_id: 100,
        title: '映画A',
        poster_path: '/a.jpg',
        release_date: '2026-01-01',
        vote_average: 7.5,
        genre_ids: [28],
        reason: '理由A',
        display_order: 1,
        generated_at: '2026-03-15T03:00:00Z',
      },
      {
        id: 'rec-2',
        tmdb_movie_id: 200,
        title: '映画B',
        poster_path: '/b.jpg',
        release_date: '2026-02-01',
        vote_average: 8.0,
        genre_ids: [878],
        reason: '理由B',
        display_order: 2,
        generated_at: '2026-03-15T03:00:00Z',
      },
    ];

    mockRecommendationsQuery(mockRecs);
    mockFavoritesCountQuery(3);
    mockDismissedMoviesQuery([100]);

    const result = await getRecommendations();

    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].tmdb_movie_id).toBe(200);
  });
});
