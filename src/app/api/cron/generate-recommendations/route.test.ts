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
  return new NextRequest('http://localhost/api/cron/generate-recommendations', {
    headers,
  });
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

/** アクティブユーザー取得のモック */
const mockActiveUsersQuery = (userIds: string[]) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      in: () => ({
        gte: () =>
          Promise.resolve({
            data: userIds.map((id) => ({ id })),
            error: null,
          }),
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

/** 興味なし映画取得のモック */
const mockDismissedMoviesQuery = (
  items: {
    tmdb_movie_id: number;
    title: string;
    genre_ids: number[] | null;
  }[] = [],
) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        is: () => Promise.resolve({ data: items, error: null }),
      }),
    }),
  });
};

/** 既存レコメンド退避のモック */
const mockSelectExistingRecommendations = (
  recs: Record<string, unknown>[] = [],
) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => Promise.resolve({ data: recs, error: null }),
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

  it('CRON_SECRETが未設定の場合401を返す', async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(createRequest('Bearer test-secret'));

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
    // アクティブユーザー取得
    mockActiveUsersQuery(['user-1']);
    // お気に入り映画取得
    mockFavoritesQuery([
      { tmdb_movie_id: 1, title: 'インターステラー', rating: 9 },
    ]);
    // ウォッチリスト取得
    mockWatchlistQuery([{ tmdb_movie_id: 2, title: 'ダークナイト' }]);
    // 興味なし映画取得
    mockDismissedMoviesQuery([]);
    // 既存レコメンド退避
    mockSelectExistingRecommendations([]);
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
    // アクティブユーザー取得（対象なし）
    mockActiveUsersQuery([]);

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.processed_users).toBe(0);
  });

  it('OpenAI APIが失敗した場合、ユーザーをスキップする', async () => {
    mockFavoritesUserQuery(['user-1']);
    mockActiveUsersQuery(['user-1']);
    mockFavoritesQuery([{ tmdb_movie_id: 1, title: 'テスト映画', rating: 5 }]);
    mockWatchlistQuery([]);
    mockDismissedMoviesQuery([]);

    mockFetchRecommendations.mockResolvedValue(null);

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.processed_users).toBe(0);
    expect(json.data.skipped_users).toBe(1);
  });

  it('TMDb検索で結果が0件の場合、ユーザーをスキップする', async () => {
    mockFavoritesUserQuery(['user-1']);
    mockActiveUsersQuery(['user-1']);
    mockFavoritesQuery([{ tmdb_movie_id: 1, title: 'テスト映画', rating: 5 }]);
    mockWatchlistQuery([]);
    mockDismissedMoviesQuery([]);

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
    mockActiveUsersQuery(['user-1']);
    mockFavoritesQuery([{ tmdb_movie_id: 1, title: 'テスト映画', rating: 5 }]);
    mockWatchlistQuery([]);
    mockDismissedMoviesQuery([]);
    mockSelectExistingRecommendations([]);
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

  it('レコメンド挿入失敗の場合、既存データを復元してスキップする', async () => {
    mockFavoritesUserQuery(['user-1']);
    mockActiveUsersQuery(['user-1']);
    mockFavoritesQuery([{ tmdb_movie_id: 1, title: 'テスト映画', rating: 5 }]);
    mockWatchlistQuery([]);
    mockDismissedMoviesQuery([]);
    mockSelectExistingRecommendations([
      {
        id: 'old-id',
        user_id: 'user-1',
        tmdb_movie_id: 50,
        title: '旧レコメンド',
        display_order: 1,
      },
    ]);
    mockDeleteRecommendations(true);
    mockInsertRecommendations(false);
    // 復元用のinsertモック
    mockInsertRecommendations(true);

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
    mockActiveUsersQuery(['user-1', 'user-2']);

    // user-1: お気に入り取得で例外
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          is: () => Promise.reject(new Error('DB error')),
        }),
      }),
    });

    // user-2: 正常処理
    mockFavoritesQuery([{ tmdb_movie_id: 1, title: 'テスト映画', rating: 5 }]);
    mockWatchlistQuery([]);
    mockDismissedMoviesQuery([]);
    mockSelectExistingRecommendations([]);
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

  it('TMDb解決が10件未満の場合、リトライして不足分を補う', async () => {
    mockFavoritesUserQuery(['user-1']);
    mockActiveUsersQuery(['user-1']);
    mockFavoritesQuery([
      { tmdb_movie_id: 1, title: 'インターステラー', rating: 9 },
    ]);
    mockWatchlistQuery([]);
    mockDismissedMoviesQuery([]);
    mockSelectExistingRecommendations([]);
    mockDeleteRecommendations(true);
    mockInsertRecommendations(true);

    // 1回目: 8件解決
    const firstBatchResolved = Array.from({ length: 8 }, (_, i) => ({
      tmdb_movie_id: 100 + i,
      title: `Movie ${i + 1}`,
      poster_path: null,
      release_date: null,
      vote_average: null,
      genre_ids: null,
      reason: `理由${i + 1}`,
      display_order: i + 1,
    }));
    // 2回目: 2件追加で合計10件に到達
    const secondBatchResolved = Array.from({ length: 2 }, (_, i) => ({
      tmdb_movie_id: 200 + i,
      title: `Extra Movie ${i + 1}`,
      poster_path: null,
      release_date: null,
      vote_average: null,
      genre_ids: null,
      reason: `追加理由${i + 1}`,
      display_order: i + 1,
    }));

    mockFetchRecommendations
      .mockResolvedValueOnce(
        firstBatchResolved.map((r) => ({
          title: r.title,
          year: 2020,
          reason: r.reason,
        })),
      )
      .mockResolvedValueOnce(
        secondBatchResolved.map((r) => ({
          title: r.title,
          year: 2021,
          reason: r.reason,
        })),
      );

    mockResolveRecommendations
      .mockResolvedValueOnce(firstBatchResolved)
      .mockResolvedValueOnce(secondBatchResolved);

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.processed_users).toBe(1);
    expect(json.data.total_recommendations).toBe(10);

    // fetchRecommendationsFromOpenAIが2回呼ばれる
    expect(mockFetchRecommendations).toHaveBeenCalledTimes(2);
    // 1回目: 10件リクエスト
    expect(mockFetchRecommendations).toHaveBeenNthCalledWith(
      1,
      [{ title: 'インターステラー', rating: 9 }],
      ['インターステラー'],
      10,
      [],
    );
    // 2回目: 不足2件リクエスト、解決済みタイトルを除外
    expect(mockFetchRecommendations).toHaveBeenNthCalledWith(
      2,
      [{ title: 'インターステラー', rating: 9 }],
      expect.arrayContaining([
        'インターステラー',
        ...firstBatchResolved.map((r) => r.title),
      ]),
      2,
      [],
    );
  });

  it('リトライは最大2回まで（合計3回）', async () => {
    mockFavoritesUserQuery(['user-1']);
    mockActiveUsersQuery(['user-1']);
    mockFavoritesQuery([{ tmdb_movie_id: 1, title: 'テスト映画', rating: 5 }]);
    mockWatchlistQuery([]);
    mockDismissedMoviesQuery([]);
    mockSelectExistingRecommendations([]);
    mockDeleteRecommendations(true);
    mockInsertRecommendations(true);

    // 毎回1件だけ解決 → 3回呼ばれて合計3件
    mockFetchRecommendations.mockResolvedValue([
      { title: 'Some Movie', year: 2020, reason: '理由' },
    ]);

    let callCount = 0;
    mockResolveRecommendations.mockImplementation(() => {
      callCount++;
      return Promise.resolve([
        {
          tmdb_movie_id: 100 + callCount,
          title: `Resolved Movie ${callCount}`,
          poster_path: null,
          release_date: null,
          vote_average: null,
          genre_ids: null,
          reason: '理由',
          display_order: 1,
        },
      ]);
    });

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.total_recommendations).toBe(3);
    // 初回 + リトライ2回 = 合計3回
    expect(mockFetchRecommendations).toHaveBeenCalledTimes(3);
  });

  it('除外リストにお気に入りとウォッチリストの両方が含まれる', async () => {
    mockFavoritesUserQuery(['user-1']);
    mockActiveUsersQuery(['user-1']);
    mockFavoritesQuery([
      { tmdb_movie_id: 1, title: 'お気に入り映画', rating: 9 },
    ]);
    mockWatchlistQuery([{ tmdb_movie_id: 2, title: 'ウォッチリスト映画' }]);
    mockDismissedMoviesQuery([]);
    mockSelectExistingRecommendations([]);
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
    await response.json();

    expect(response.status).toBe(200);

    // 初回のfetchRecommendationsFromOpenAIに除外タイトルと件数が渡されていることを確認
    expect(mockFetchRecommendations).toHaveBeenNthCalledWith(
      1,
      [{ title: 'お気に入り映画', rating: 9 }],
      ['お気に入り映画', 'ウォッチリスト映画'],
      10,
      [],
    );

    // 初回のresolveRecommendationsWithTMDbに除外IDセットが渡されていることを確認
    expect(mockResolveRecommendations).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      new Set([1, 2]),
    );
  });

  it('非アクティブユーザーはスキップされる', async () => {
    // お気に入りユーザー2人いるが、アクティブは1人だけ
    mockFavoritesUserQuery(['user-1', 'user-2']);
    mockActiveUsersQuery(['user-1']);

    // user-1のみ処理
    mockFavoritesQuery([{ tmdb_movie_id: 1, title: 'テスト映画', rating: 5 }]);
    mockWatchlistQuery([]);
    mockDismissedMoviesQuery([]);
    mockSelectExistingRecommendations([]);
    mockDeleteRecommendations(true);
    mockInsertRecommendations(true);

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
    expect(json.data.processed_users).toBe(1);
    expect(json.data.inactive_users).toBe(1);
  });

  it('全ユーザーが非アクティブの場合、0件処理', async () => {
    mockFavoritesUserQuery(['user-1', 'user-2']);
    mockActiveUsersQuery([]);

    const response = await GET(createRequest('Bearer test-secret'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.processed_users).toBe(0);
    expect(json.data.inactive_users).toBe(2);
  });

  it('興味なし映画が除外リストとOpenAIプロンプトに含まれる', async () => {
    mockFavoritesUserQuery(['user-1']);
    mockActiveUsersQuery(['user-1']);
    mockFavoritesQuery([
      { tmdb_movie_id: 1, title: 'お気に入り映画', rating: 9 },
    ]);
    mockWatchlistQuery([]);
    mockDismissedMoviesQuery([
      { tmdb_movie_id: 10, title: '興味なし映画A', genre_ids: [27] },
      { tmdb_movie_id: 20, title: '興味なし映画B', genre_ids: [27, 53] },
    ]);
    mockSelectExistingRecommendations([]);
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
    await response.json();

    expect(response.status).toBe(200);

    // 除外タイトルに興味なし映画が含まれる
    expect(mockFetchRecommendations).toHaveBeenNthCalledWith(
      1,
      [{ title: 'お気に入り映画', rating: 9 }],
      ['お気に入り映画', '興味なし映画A', '興味なし映画B'],
      10,
      [
        { tmdb_movie_id: 10, title: '興味なし映画A', genre_ids: [27] },
        { tmdb_movie_id: 20, title: '興味なし映画B', genre_ids: [27, 53] },
      ],
    );

    // 除外IDセットに興味なし映画のIDが含まれる
    expect(mockResolveRecommendations).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      new Set([1, 10, 20]),
    );
  });
});
