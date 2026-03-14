/**
 * @jest-environment node
 */

/**
 * トレンド映画同期ロジック テスト
 */

import { syncTrendingMovies } from './syncTrendingMovies';

// --- Mocks ---

const mockGetTrendingMovies = jest.fn();
jest.mock('@/lib/tmdb/tmdb', () => ({
  getTrendingMovies: () => mockGetTrendingMovies(),
}));

const mockFrom = jest.fn();
const mockDelete = jest.fn();
const mockGte = jest.fn();
const mockInsert = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      mockFrom(table);
      return {
        delete: () => {
          mockDelete();
          return {
            gte: (_col: string, _val: number) => {
              mockGte(_col, _val);
              return Promise.resolve({ error: null });
            },
          };
        },
        insert: (rows: unknown[]) => {
          mockInsert(rows);
          return Promise.resolve({ error: null });
        },
      };
    },
  }),
}));

// --- Helpers ---

const createTrendingMovies = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Movie ${i + 1}`,
    poster_path: `/poster${i + 1}.jpg`,
    release_date: '2026-03-01',
    vote_average: 7.5,
    popularity: 100 + i,
  }));

// --- Tests ---

describe('syncTrendingMovies', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('Supabase環境変数が未設定の場合エラーをスローする', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';

    await expect(syncTrendingMovies()).rejects.toThrow(
      'Supabase環境変数が設定されていません',
    );
  });

  it('TMDb APIから取得した映画を10件に制限してDBに保存する', async () => {
    mockGetTrendingMovies.mockResolvedValue({
      results: createTrendingMovies(20),
    });

    const result = await syncTrendingMovies();

    expect(result.fetched).toBe(20);
    expect(result.synced).toBe(10);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);

    const insertedRows = mockInsert.mock.calls[0][0];
    expect(insertedRows).toHaveLength(10);
    expect(insertedRows[0].display_order).toBe(1);
    expect(insertedRows[9].display_order).toBe(10);
  });

  it('取得結果が0件の場合DBへの書き込みをスキップする', async () => {
    mockGetTrendingMovies.mockResolvedValue({ results: [] });

    const result = await syncTrendingMovies();

    expect(result.fetched).toBe(0);
    expect(result.synced).toBe(0);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('空のrelease_dateをnullに変換する', async () => {
    mockGetTrendingMovies.mockResolvedValue({
      results: [
        {
          id: 1,
          title: 'Test',
          poster_path: null,
          release_date: '',
          vote_average: 5.0,
          popularity: 50,
        },
      ],
    });

    await syncTrendingMovies();

    const insertedRows = mockInsert.mock.calls[0][0];
    expect(insertedRows[0].release_date).toBeNull();
  });

  it('TMDb API取得失敗時はエラーをスローし既存データを保持する', async () => {
    mockGetTrendingMovies.mockRejectedValue(new Error('API error'));

    await expect(syncTrendingMovies()).rejects.toThrow('API error');
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
