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

// --- Tests ---

describe('GET /api/movies/genres', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('正常にジャンル一覧を返す', async () => {
    const mockGenres = [
      { id: 28, name: 'アクション' },
      { id: 12, name: 'アドベンチャー' },
      { id: 35, name: 'コメディ' },
    ];
    mockGetGenres.mockResolvedValue(mockGenres);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.genres).toEqual(mockGenres);
    expect(json.data.genres).toHaveLength(3);
  });

  it('空のジャンル一覧を返す', async () => {
    mockGetGenres.mockResolvedValue([]);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.genres).toEqual([]);
  });

  it('TMDb APIエラー時に500を返す', async () => {
    mockGetGenres.mockRejectedValue(new Error('TMDb API error'));

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('SERVER_ERROR');
  });
});
