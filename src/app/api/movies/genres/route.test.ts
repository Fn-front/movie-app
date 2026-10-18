/**
 * @jest-environment node
 */

/**
 * ジャンル一覧API Route テスト
 */

import { GET } from './route';

// --- Mocks ---

const mockGetGenres = jest.fn();

jest.mock('@/lib/tmdb/tmdb', () => ({
  getGenres: (...args: unknown[]) => mockGetGenres(...args),
}));

const mockEnforcePublicRateLimit = jest.fn();
jest.mock('@/helpers/publicRateLimit', () => ({
  enforcePublicRateLimit: (...args: unknown[]) =>
    mockEnforcePublicRateLimit(...args),
}));

// --- Helpers ---

const createRequest = () =>
  new Request('http://localhost/api/movies/genres', { method: 'GET' });

// --- Tests ---

describe('GET /api/movies/genres', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 既定は上限内（null を返すと通過）
    mockEnforcePublicRateLimit.mockResolvedValue(null);
  });

  it('正常にジャンル一覧を返す', async () => {
    const mockGenres = [
      { id: 28, name: 'アクション' },
      { id: 12, name: 'アドベンチャー' },
      { id: 35, name: 'コメディ' },
    ];
    mockGetGenres.mockResolvedValue(mockGenres);

    const response = await GET(createRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.genres).toEqual(mockGenres);
    expect(json.data.genres).toHaveLength(3);
  });

  it('空のジャンル一覧を返す', async () => {
    mockGetGenres.mockResolvedValue([]);

    const response = await GET(createRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.genres).toEqual([]);
  });

  it('成功レスポンスにCache-Controlヘッダーが設定される', async () => {
    mockGetGenres.mockResolvedValue([{ id: 28, name: 'アクション' }]);

    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(
      'public, s-maxage=604800',
    );
  });

  it('TMDb APIエラー時に500を返す', async () => {
    mockGetGenres.mockRejectedValue(new Error('TMDb API error'));

    const response = await GET(createRequest());
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('SERVER_ERROR');
  });

  describe('レート制限', () => {
    it('上限超過の場合は TMDb を呼ばずに 429 を返す', async () => {
      mockEnforcePublicRateLimit.mockResolvedValue(
        new Response(JSON.stringify({ success: false }), { status: 429 }),
      );

      const response = await GET(createRequest());

      expect(response.status).toBe(429);
      // getGenres は in-process キャッシュを持たないため、呼ぶ前に止める必要がある
      expect(mockGetGenres).not.toHaveBeenCalled();
    });

    it('送信元単位の read_api_genres として数える', async () => {
      mockGetGenres.mockResolvedValue([]);

      await GET(createRequest());

      expect(mockEnforcePublicRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'read_api_genres' }),
      );
    });
  });
});
