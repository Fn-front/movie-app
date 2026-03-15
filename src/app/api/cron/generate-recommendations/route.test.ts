/**
 * @jest-environment node
 */

/**
 * レコメンド生成 Cron API テスト
 */

import { NextRequest } from 'next/server';

import { GET } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: jest.fn(() => ({ from: mockFrom })),
  dbConnectionErrorResponse: jest.fn(),
}));

const mockFetchRecommendations = jest.fn();
const mockResolveRecommendations = jest.fn();
jest.mock('@/lib/openai/generateRecommendations', () => ({
  fetchRecommendationsFromOpenAI: (...args: unknown[]) =>
    mockFetchRecommendations(...args),
  resolveRecommendationsWithTMDb: (...args: unknown[]) =>
    mockResolveRecommendations(...args),
}));

// --- Helpers ---

const createRequest = (authHeader?: string) => {
  const headers = new Headers();
  if (authHeader) {
    headers.set('authorization', authHeader);
  }
  return new NextRequest(
    'http://localhost/api/cron/generate-recommendations',
    { headers },
  );
};

/** お気に入りユーザー取得のモック */
const mockFavoritesUserQuery = (userIds: string[]) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      is: () =>
        Promise.resolve({
          data: userIds.map((id) => ({ user_id: id })),
          error: null,
        }),
    }),
  });
};

/** お気に入り映画取得のモック */
const mockFavoritesQuery = (
  favorites: { tmdb_movie_id: number; title: string; rating: number }[],
) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        is: () => Promise.resolve({ data: favorites, error: null }),
      }),
    }),
  });
};

/** ウォッチリスト取得のモック */
const mockWatchlistQuery = (
  items: { tmdb_movie_id: number; title: string }[],
) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        is: () => Promise.resolve({ data: items, error: null }),
      }),
    }),
  });
};

/** レコメンド削除のモック */
const mockDeleteRecommendations = (success: boolean) => {
  mockFrom.mockReturnValueOnce({
    delete: () => ({
      eq: () =>
        Promise.resolve({
          data: null,
          error: success ? null : new Error('Delete failed'),
        }),
    }),
  });
};

/** レコメンド挿入のモック */
const mockInsertRecommendations = (success: boolean) => {
  mockFrom.mockReturnValueOnce({
    insert: () =>
      Promise.resolve({
        error: success ? null : new Error('Insert failed'),
      }),
  });
};

// --- Tests ---

describe('GET /api/cron/generate-recommendations', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, CRON_SECRET: 'test-secret' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('認証なしで401を返す', async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(401);
  });

  it('不正な認証トークンで401を返す', async () => {
    const response = await GET(createRequest('Bearer wrong-secret'));

    expect(response.status).toBe(401);
  });

  it('DB接続エラーで500を返す', async () => {
    const { createServiceRoleClient } = await import('@/helpers/supabase');
    (createServiceRoleClient as jest.Mock).mockReturnValueOnce(null);

    const response = await GET(createRequest('Bearer test-secret'));

    expect(response.status).toBe(500);
  });

  it('正常にレコメンドを生成する', async () => {
    // お気に入りユーザー取得
    mockFavoritesUserQuery(['user-1']);
    // お気に入り映画取得
    mockFavoritesQuery([
      { tmdb_movie_id: 1, title: 'インターステラー', rating: 9 },
    ]);
    // ウォッチリスト取得
    mockWatchlistQuery([{ tmdb_movie_id: 2, title: 'ダークナイト' }]);
    // レコメンド削除
    mockDeleteRecommendations(true);
    // レコメンド挿入
    mockInsertRecommendations(true);

    mockFetchRecommendations.mockResolvedValue([
      { title: 'Arrival', year: 2016, reason: 'SF好きにおすすめ' },
    ]);

    mockResolveRecommendations.mockResolvedValue([
      {
        tmdb_movie_id: 100,
        title: 'メッセージ',
        poster_path: '/arrival.jpg',
        release_date: '2016-11-11',
        vote_average: 7.9,
        genre_ids: [878],
        reason: 'SF好きにおすすめ',
        display_order: 1,
      },
    ]);

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.processed_users).toBe(1);
    expect(json.data.total_recommendations).toBe(1);
  });

  it('お気に入り0件のユーザーはスキップされる', async () => {
    // お気に入りユーザーなし
    mockFavoritesUserQuery([]);

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.processed_users).toBe(0);
  });

  it('OpenAI APIが失敗した場合、ユーザーをスキップする', async () => {
    mockFavoritesUserQuery(['user-1']);
    mockFavoritesQuery([
      { tmdb_movie_id: 1, title: 'テスト映画', rating: 5 },
    ]);
    mockWatchlistQuery([]);

    mockFetchRecommendations.mockResolvedValue(null);

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.processed_users).toBe(0);
    expect(json.data.skipped_users).toBe(1);
  });

  it('TMDb検索で結果が0件の場合、ユーザーをスキップする', async () => {
    mockFavoritesUserQuery(['user-1']);
    mockFavoritesQuery([
      { tmdb_movie_id: 1, title: 'テスト映画', rating: 5 },
    ]);
    mockWatchlistQuery([]);

    mockFetchRecommendations.mockResolvedValue([
      { title: 'Unknown', year: 2020, reason: '理由' },
    ]);
    mockResolveRecommendations.mockResolvedValue([]);

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.skipped_users).toBe(1);
  });

  it('レコメンド削除失敗の場合、ユーザーをスキップする', async () => {
    mockFavoritesUserQuery(['user-1']);
    mockFavoritesQuery([
      { tmdb_movie_id: 1, title: 'テスト映画', rating: 5 },
    ]);
    mockWatchlistQuery([]);
    mockDeleteRecommendations(false);

    mockFetchRecommendations.mockResolvedValue([
      { title: 'Movie A', year: 2020, reason: '理由' },
    ]);
    mockResolveRecommendations.mockResolvedValue([
      {
        tmdb_movie_id: 100,
        title: 'Movie A',
        poster_path: null,
        release_date: null,
        vote_average: null,
        genre_ids: null,
        reason: '理由',
        display_order: 1,
      },
    ]);

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.skipped_users).toBe(1);
  });

  it('レコメンド挿入失敗の場合、ユーザーをスキップする', async () => {
    mockFavoritesUserQuery(['user-1']);
    mockFavoritesQuery([
      { tmdb_movie_id: 1, title: 'テスト映画', rating: 5 },
    ]);
    mockWatchlistQuery([]);
    mockDeleteRecommendations(true);
    mockInsertRecommendations(false);

    mockFetchRecommendations.mockResolvedValue([
      { title: 'Movie A', year: 2020, reason: '理由' },
    ]);
    mockResolveRecommendations.mockResolvedValue([
      {
        tmdb_movie_id: 100,
        title: 'Movie A',
        poster_path: null,
        release_date: null,
        vote_average: null,
        genre_ids: null,
        reason: '理由',
        display_order: 1,
      },
    ]);

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.skipped_users).toBe(1);
  });

  it('ユーザー処理中の例外は他のユーザーに影響しない', async () => {
    mockFavoritesUserQuery(['user-1', 'user-2']);

    // user-1: お気に入り取得で例外
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          is: () => Promise.reject(new Error('DB error')),
        }),
      }),
    });

    // user-2: 正常処理
    mockFavoritesQuery([
      { tmdb_movie_id: 1, title: 'テスト映画', rating: 5 },
    ]);
    mockWatchlistQuery([]);
    mockDeleteRecommendations(true);
    mockInsertRecommendations(true);

    mockFetchRecommendations.mockResolvedValue([
      { title: 'Movie B', year: 2021, reason: '理由' },
    ]);
    mockResolveRecommendations.mockResolvedValue([
      {
        tmdb_movie_id: 200,
        title: 'Movie B',
        poster_path: null,
        release_date: null,
        vote_average: null,
        genre_ids: null,
        reason: '理由',
        display_order: 1,
      },
    ]);

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.processed_users).toBe(1);
    expect(json.data.skipped_users).toBe(1);
  });

  it('除外リストにお気に入りとウォッチリストの両方が含まれる', async () => {
    mockFavoritesUserQuery(['user-1']);
    mockFavoritesQuery([
      { tmdb_movie_id: 1, title: 'お気に入り映画', rating: 9 },
    ]);
    mockWatchlistQuery([
      { tmdb_movie_id: 2, title: 'ウォッチリスト映画' },
    ]);
    mockDeleteRecommendations(true);
    mockInsertRecommendations(true);

    mockFetchRecommendations.mockResolvedValue([
      { title: 'New Movie', year: 2023, reason: '理由' },
    ]);
    mockResolveRecommendations.mockResolvedValue([
      {
        tmdb_movie_id: 300,
        title: 'New Movie',
        poster_path: null,
        release_date: null,
        vote_average: null,
        genre_ids: null,
        reason: '理由',
        display_order: 1,
      },
    ]);

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);

    // fetchRecommendationsFromOpenAIに除外タイトルが渡されていることを確認
    expect(mockFetchRecommendations).toHaveBeenCalledWith(
      [{ title: 'お気に入り映画', rating: 9 }],
      ['お気に入り映画', 'ウォッチリスト映画'],
    );

    // resolveRecommendationsWithTMDbに除外IDセットが渡されていることを確認
    expect(mockResolveRecommendations).toHaveBeenCalledWith(
      expect.anything(),
      new Set([1, 2]),
    );
  });
});
