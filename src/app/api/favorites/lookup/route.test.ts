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

import { getAuthSession } from '@/helpers/auth';

// --- Helpers ---

const createGetRequest = () =>
  new Request('http://localhost/api/favorites/lookup');

/**
 * `.select().eq().is()` のチェーンを組み立てる。
 * 各段の引数を控えて、ユーザー絞り込みと論理削除の除外を検証できるようにする
 */
const mockQueryChain = (result: {
  data: unknown[] | null;
  error: unknown;
}) => {
  const select = jest.fn();
  const eq = jest.fn();
  const is = jest.fn().mockReturnValue(result);

  eq.mockReturnValue({ is });
  select.mockReturnValue({ eq });
  mockFrom.mockReturnValue({ select });

  return { select, eq, is };
};

// --- Tests ---

describe('GET /api/favorites/lookup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
   * 一覧API（1ページ20件）と違ってページングしない。
   * 21件目以降が「未登録」と判定される問題を無くすのが目的（#829）
   */
  it('21件以上あっても全件返す', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      id: `fav-${i + 1}`,
      tmdb_movie_id: 1000 + i,
      rating: 5,
    }));
    mockQueryChain({ data: many, error: null });

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(json.data.favorites).toHaveLength(25);
    expect(json.data.favorites[24].tmdb_movie_id).toBe(1024);
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
});
