/**
 * @jest-environment node
 */

/**
 * お気に入り照会API Route テスト (GET)
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

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

import { getAuthSession } from '@/helpers/auth';

// --- Helpers ---

const createGetRequest = () =>
  new Request('http://localhost/api/favorites/lookup');

/**
 * `.select().eq().is().order().range()` のチェーンを組み立てる。
 * 各段の引数を控えて、ユーザー絞り込み・論理削除の除外・ページングを検証できるようにする
 *
 * @param results - `range()` が返す結果。呼ばれた順に消費する
 *   （最後まで使い切ったら以降は最後の結果を返し続ける）
 */
const mockQueryChain = (
  ...results: { data: unknown[] | null; error: unknown }[]
) => {
  const select = jest.fn();
  const eq = jest.fn();
  const is = jest.fn();
  const order = jest.fn();
  let call = 0;
  const range = jest.fn().mockImplementation(() => {
    const result = results[Math.min(call, results.length - 1)];
    call += 1;
    return result;
  });

  order.mockReturnValue({ range });
  is.mockReturnValue({ order });
  eq.mockReturnValue({ is });
  select.mockReturnValue({ eq });
  mockFrom.mockReturnValue({ select });

  return { select, eq, is, order, range };
};

/** `tmdb_movie_id` が連番の照会行を作る */
const lookupRows = (count: number, startId = 1000) =>
  Array.from({ length: count }, (_, i) => ({
    id: `fav-${i + 1}`,
    tmdb_movie_id: startId + i,
    rating: 5,
  }));

// --- Tests ---

describe('GET /api/favorites/lookup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('ID・映画ID・評価だけを返す', async () => {
    mockQueryChain({
      data: [
        { id: 'fav-1', tmdb_movie_id: 100, rating: 8 },
        { id: 'fav-2', tmdb_movie_id: 200, rating: 6 },
      ],
      error: null,
    });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.favorites).toEqual([
      { id: 'fav-1', tmdb_movie_id: 100, rating: 8 },
      { id: 'fav-2', tmdb_movie_id: 200, rating: 6 },
    ]);
  });

  it('タイトルやポスターは取得しない（転送量を抑えるため）', async () => {
    const { select } = mockQueryChain({ data: [], error: null });

    await GET(createGetRequest());

    expect(select).toHaveBeenCalledWith('id, tmdb_movie_id, rating');
  });

  /**
   * 一覧API（1ページ20件）と違い、呼び出し側から見れば全件返る。
   * 21件目以降が「未登録」と判定される問題を無くすのが目的（#829）
   */
  it('21件以上あっても全件返す', async () => {
    mockQueryChain({ data: lookupRows(25), error: null });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(json.data.favorites).toHaveLength(25);
    expect(json.data.favorites[24].tmdb_movie_id).toBe(1024);
  });

  /**
   * PostgREST は max_rows（1000）で黙って打ち切り、エラーも truncation も
   * 返さない。絞り込み無しで投げると 1001 件目以降が静かに消え、
   * このAPIが直したはずの #829 が高い閾値で再発する
   */
  describe('max_rows を超える件数', () => {
    it('1ページぶん返ってきたら続きを読む', async () => {
      const { range } = mockQueryChain(
        { data: lookupRows(1000, 1000), error: null },
        { data: lookupRows(3, 9000), error: null },
      );

      const response = await GET(createGetRequest());
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.favorites).toHaveLength(1003);
      expect(range).toHaveBeenNthCalledWith(1, 0, 999);
      expect(range).toHaveBeenNthCalledWith(2, 1000, 1999);
      expect(json.data.favorites[1002].tmdb_movie_id).toBe(9002);
    });

    it('1ページに満たなければ追加で読まない', async () => {
      const { range } = mockQueryChain({ data: lookupRows(5), error: null });

      await GET(createGetRequest());

      expect(range).toHaveBeenCalledTimes(1);
    });

    // 暴走を止める保険。現実的な利用では到達しない
    it('上限ページ数で打ち切り、警告を出す', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const { range } = mockQueryChain({
        data: lookupRows(1000, 1000),
        error: null,
      });

      const response = await GET(createGetRequest());
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(range).toHaveBeenCalledTimes(10);
      expect(json.data.favorites).toHaveLength(10000);
      expect(warn).toHaveBeenCalled();

      warn.mockRestore();
    });
  });

  // 並び順を固定しないと、ページ境界で取りこぼし・重複が起きうる
  it('ページング中の並び順を固定する', async () => {
    const { order } = mockQueryChain({ data: [], error: null });

    await GET(createGetRequest());

    expect(order).toHaveBeenCalledWith('id', { ascending: true });
  });

  it('自分のお気に入りだけを論理削除を除いて引く', async () => {
    const { eq, is } = mockQueryChain({ data: [], error: null });

    await GET(createGetRequest());

    expect(mockFrom).toHaveBeenCalledWith('favorites');
    expect(eq).toHaveBeenCalledWith('user_id', 'user-123');
    expect(is).toHaveBeenCalledWith('deleted_at', null);
  });

  it('お気に入り0件なら空配列を返す', async () => {
    mockQueryChain({ data: [], error: null });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.favorites).toEqual([]);
  });

  it('data が null でも空配列を返す', async () => {
    mockQueryChain({ data: null, error: null });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(json.data.favorites).toEqual([]);
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await GET(createGetRequest());

    expect(response.status).toBe(401);
  });

  it('DBエラーで500を返す', async () => {
    mockQueryChain({ data: null, error: { message: 'db error' } });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
  });

  describe('レート制限（#934）', () => {
    it('読み取り用の read_api_user_data として数える', async () => {
      mockQueryChain({ data: [], error: null });

      await GET(createGetRequest());

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'user-123',
        'read_api_user_data',
        1200,
        10,
      );
    });

    it('上限超過で429を返し、DBを読まない', async () => {
      // 1リクエストで最大ページ数ぶん読むため、無制限だと負荷が大きい
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        retryAfter: 600,
      });

      const response = await GET(createGetRequest());

      expect(response.status).toBe(429);
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });
});
