/**
 * @jest-environment node
 */

/**
 * 劇場公開中の人気映画同期ロジック テスト
 */

import { syncNowShowingMovies } from './syncNowShowingMovies';

// --- Mocks ---

const mockDiscoverMovies = jest.fn();
jest.mock('@/lib/tmdb/tmdb', () => ({
  discoverMovies: (params: Record<string, unknown>) =>
    mockDiscoverMovies(params),
}));

const mockRpc = jest
  .fn()
  .mockReturnValue(Promise.resolve({ error: null }));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

// --- Helpers ---

const createMovies = (count: number, startId: number = 1) =>
  Array.from({ length: count }, (_, i) => ({
    id: startId + i,
    title: `Movie ${startId + i}`,
    poster_path: `/poster${startId + i}.jpg`,
    release_date: '2026-03-01',
    vote_average: 7.5,
    popularity: 100 - i,
  }));

// --- Tests ---

describe('syncNowShowingMovies', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    };
    // デフォルト: 20件返す
    mockDiscoverMovies.mockResolvedValue({ results: createMovies(20) });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('Supabase環境変数が未設定の場合エラーをスローする', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = '';

    await expect(syncNowShowingMovies()).rejects.toThrow(
      'Supabase環境変数が設定されていません',
    );
  });

  it('Discover APIに劇場公開フィルターと日付範囲を渡す', async () => {
    await syncNowShowingMovies();

    expect(mockDiscoverMovies).toHaveBeenCalledTimes(1);
    const params = mockDiscoverMovies.mock.calls[0][0];
    expect(params.sort_by).toBe('popularity.desc');
    expect(params.with_release_type).toBe('2|3');
    expect(params['release_date.gte']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params['release_date.lte']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('10件に制限してDBに保存する', async () => {
    const result = await syncNowShowingMovies();

    expect(result.fetched).toBe(20);
    expect(result.synced).toBe(10);
    expect(mockRpc).toHaveBeenCalledTimes(1);

    const rpcMovies = mockRpc.mock.calls[0][1].movies;
    expect(rpcMovies).toHaveLength(10);
  });

  it('display_orderが1から連番になる', async () => {
    mockDiscoverMovies.mockResolvedValue({ results: createMovies(3) });

    await syncNowShowingMovies();

    const rpcMovies = mockRpc.mock.calls[0][1].movies;
    expect(
      rpcMovies.map((m: { display_order: number }) => m.display_order),
    ).toEqual([1, 2, 3]);
  });

  it('取得結果が0件の場合DBへの書き込みをスキップする', async () => {
    mockDiscoverMovies.mockResolvedValue({ results: [] });

    const result = await syncNowShowingMovies();

    expect(result.fetched).toBe(0);
    expect(result.synced).toBe(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('空のrelease_dateをnullに変換する', async () => {
    mockDiscoverMovies.mockResolvedValue({
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

    await syncNowShowingMovies();

    const rpcMovies = mockRpc.mock.calls[0][1].movies;
    expect(rpcMovies[0].release_date).toBeNull();
  });

  it('TMDb API取得失敗時はエラーをスローし既存データを保持する', async () => {
    mockDiscoverMovies.mockRejectedValue(new Error('API error'));

    await expect(syncNowShowingMovies()).rejects.toThrow('API error');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('Supabase RPC失敗時はエラーをスローする', async () => {
    mockRpc.mockReturnValueOnce(
      Promise.resolve({ error: { message: 'RPC failed' } }),
    );

    await expect(syncNowShowingMovies()).rejects.toThrow(
      '劇場公開中の人気映画の同期に失敗しました: RPC failed',
    );
  });
});
