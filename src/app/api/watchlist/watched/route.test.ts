/**
 * @jest-environment node
 */

/**
 * 指定年の視聴済み一覧API Route テスト (GET)
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

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// --- Helpers ---

const createGetRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/watchlist/watched');
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  return new Request(url.toString());
};

/** eq / is / not / gte / lt / order / range に渡された引数を記録する */
const calls: Record<string, unknown[][]> = {};

/**
 * watchlist の取得と、続けて呼ばれる favorites の取得をまとめてモックする
 *
 * @param data - watchlist の行
 * @param count - watchlist の総件数
 * @param error - watchlist クエリのエラー
 * @param favoriteMovieIds - お気に入り登録済みの tmdb_movie_id
 */
const mockWatchedQuery = (
  data: unknown[] | null,
  count: number | null,
  error: unknown = null,
  favoriteMovieIds: number[] = [],
) => {
  for (const key of Object.keys(calls)) delete calls[key];

  // jest.clearAllMocks() は mockReturnValueOnce のキューを消さない。
  // favorites を引かないケース（対象0件）で2つ目が未消費のまま残り、
  // 次のテストの watchlist 取得に化けるため、ここで積み直す
  mockFrom.mockReset();

  const record = (name: string) => {
    return (...args: unknown[]) => {
      calls[name] = [...(calls[name] ?? []), args];
      return chain;
    };
  };

  const chain: Record<string, unknown> = {
    eq: record('eq'),
    is: record('is'),
    not: record('not'),
    gte: record('gte'),
    lt: record('lt'),
    order: record('order'),
    range: (...args: unknown[]) => {
      calls.range = [...(calls.range ?? []), args];
      return Promise.resolve({ data, count, error });
    },
  };

  mockFrom.mockReturnValueOnce({
    select: (...args: unknown[]) => {
      calls.select = [...(calls.select ?? []), args];
      return chain;
    },
  });

  // favorites の突き合わせクエリ（watchlist が1件以上のときだけ呼ばれる）
  const favoriteChain: Record<string, unknown> = {
    eq: () => favoriteChain,
    is: () => favoriteChain,
    in: (...args: unknown[]) => {
      calls.favoriteIn = [...(calls.favoriteIn ?? []), args];
      return Promise.resolve({
        data: favoriteMovieIds.map((id) => ({ tmdb_movie_id: id })),
        error: null,
      });
    },
  };

  mockFrom.mockReturnValueOnce({
    select: () => favoriteChain,
  });
};

const sampleItem = {
  id: '11111111-1111-4111-8111-111111111111',
  tmdb_movie_id: 100,
  title: '映画A',
  poster_path: '/a.jpg',
  release_date: '2024-03-15',
  added_at: '2024-03-01T00:00:00Z',
  watched_at: '2024-04-01T00:00:00Z',
};

// --- Tests ---

describe('GET /api/watchlist/watched', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('指定年の視聴済みを返す', async () => {
    mockWatchedQuery([sampleItem], 1);

    const response = await GET(createGetRequest({ year: '2024' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.watchlist).toHaveLength(1);
    expect(body.data.has_more).toBe(false);
    expect(body.data.next_cursor).toBeNull();
  });

  it('JSTの年範囲で絞り込む（UTCの前年を取りこぼさない）', async () => {
    mockWatchedQuery([], 0);

    await GET(createGetRequest({ year: '2025' }));

    expect(calls.gte).toContainEqual(['added_at', '2025-01-01T00:00:00+09:00']);
    expect(calls.lt).toContainEqual(['added_at', '2026-01-01T00:00:00+09:00']);
  });

  it('自分のユーザーIDと視聴済み・未削除で絞り込む', async () => {
    mockWatchedQuery([], 0);

    await GET(createGetRequest({ year: '2024' }));

    expect(calls.eq).toContainEqual(['user_id', 'user-123']);
    expect(calls.is).toContainEqual(['deleted_at', null]);
    expect(calls.not).toContainEqual(['watched_at', 'is', null]);
  });

  it('総件数が取得件数を上回るとき次カーソルを返す', async () => {
    mockWatchedQuery([sampleItem], 30);

    const response = await GET(createGetRequest({ year: '2024', limit: '20' }));
    const body = await response.json();

    expect(body.data.has_more).toBe(true);
    expect(body.data.next_cursor).toBe('20');
  });

  it('カーソル指定でオフセットが進む', async () => {
    mockWatchedQuery([sampleItem], 30);

    await GET(createGetRequest({ year: '2024', limit: '20', cursor: '20' }));

    expect(calls.range).toContainEqual([20, 39]);
  });

  it('0件なら空配列を返す', async () => {
    mockWatchedQuery([], 0);

    const response = await GET(createGetRequest({ year: '2024' }));
    const body = await response.json();

    expect(body.data.watchlist).toEqual([]);
    expect(body.data.has_more).toBe(false);
  });

  it('year が無いと400を返す', async () => {
    const response = await GET(createGetRequest());

    expect(response.status).toBe(400);
  });

  it('year が範囲外だと400を返す', async () => {
    const response = await GET(createGetRequest({ year: '1999' }));

    expect(response.status).toBe(400);
  });

  it('cursor が負数だと400を返す', async () => {
    const response = await GET(
      createGetRequest({ year: '2024', cursor: '-1' }),
    );

    expect(response.status).toBe(400);
  });

  it('未認証なら401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(createGetRequest({ year: '2024' }));

    expect(response.status).toBe(401);
  });

  it('レート制限を超えたら429を返す', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

    const response = await GET(createGetRequest({ year: '2024' }));

    expect(response.status).toBe(429);
  });

  it('クエリが失敗したら500を返す', async () => {
    mockWatchedQuery(null, null, { message: 'boom' });

    const response = await GET(createGetRequest({ year: '2024' }));

    expect(response.status).toBe(500);
  });

  describe('お気に入り登録の有無', () => {
    it('お気に入り登録済みの行は has_favorite が true になる', async () => {
      mockWatchedQuery([sampleItem], 1, null, [sampleItem.tmdb_movie_id]);

      const response = await GET(createGetRequest({ year: '2024' }));
      const body = await response.json();

      expect(body.data.watchlist[0].has_favorite).toBe(true);
    });

    it('未登録の行は has_favorite が false になる', async () => {
      mockWatchedQuery([sampleItem], 1, null, []);

      const response = await GET(createGetRequest({ year: '2024' }));
      const body = await response.json();

      expect(body.data.watchlist[0].has_favorite).toBe(false);
    });

    it('表示中の映画IDだけで favorites を引く', async () => {
      mockWatchedQuery([sampleItem], 1, null, []);

      await GET(createGetRequest({ year: '2024' }));

      expect(calls.favoriteIn).toContainEqual([
        'tmdb_movie_id',
        [sampleItem.tmdb_movie_id],
      ]);
    });

    it('対象が0件なら favorites を引かない', async () => {
      mockWatchedQuery([], 0);

      await GET(createGetRequest({ year: '2024' }));

      expect(calls.favoriteIn).toBeUndefined();
    });
  });

  describe('処理順', () => {
    // 認証 → レート制限 → バリデーション（#940）。
    // 識別子が session.user.id なので検証より前に確定している
    // （`.claude/rules/api-route.md`）
    it('バリデーションエラー時もレート制限を消費する', async () => {
      // 先行テストが allowed:false を残すため明示的に戻す
      // （clearAllMocks は実装を消さない）
      mockCheckRateLimit.mockResolvedValue({ allowed: true });

      const response = await GET(createGetRequest());

      expect(response.status).toBe(400);
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    });

    it('レート制限超過時は、yearが無くても429を返す', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 600 });

      const response = await GET(createGetRequest());

      expect(response.status).toBe(429);
    });
  });
});
