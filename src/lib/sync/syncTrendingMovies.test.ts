/**
 * @jest-environment node
 */

/**
 * トレンド映画同期ロジック テスト
 */

import { syncTrendingMovies } from './syncTrendingMovies';

// --- Mocks ---

const mockGetTrendingMovies = jest.fn();
const mockGetMovieReleaseDates = jest.fn();
jest.mock('@/lib/tmdb/tmdb', () => ({
  getTrendingMovies: () => mockGetTrendingMovies(),
  getMovieReleaseDates: (movieId: number) => mockGetMovieReleaseDates(movieId),
}));

const mockRpc = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: (fn: string, params: unknown) => {
      mockRpc(fn, params);
      return Promise.resolve({ error: null });
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

/** JP劇場公開ありのリリース日レスポンス */
const theatricalReleaseDates = [
  {
    iso_3166_1: 'JP',
    release_dates: [{ type: 3, release_date: '2026-03-01' }],
  },
];

/** ストリーミングのみのリリース日レスポンス */
const streamingOnlyReleaseDates = [
  {
    iso_3166_1: 'JP',
    release_dates: [{ type: 4, release_date: '2026-03-01' }],
  },
  {
    iso_3166_1: 'US',
    release_dates: [{ type: 4, release_date: '2026-02-15' }],
  },
];

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
    // デフォルト: 全て劇場公開
    mockGetMovieReleaseDates.mockResolvedValue(theatricalReleaseDates);
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

  it('劇場公開作品のみを10件に制限してDBに保存する', async () => {
    mockGetTrendingMovies.mockResolvedValue({
      results: createTrendingMovies(20),
    });

    const result = await syncTrendingMovies();

    expect(result.fetched).toBe(20);
    expect(result.synced).toBe(10);
    expect(mockRpc).toHaveBeenCalledTimes(1);

    const rpcMovies = mockRpc.mock.calls[0][1].movies;
    expect(rpcMovies).toHaveLength(10);
  });

  it('ストリーミング作品を除外する', async () => {
    const movies = createTrendingMovies(5);
    mockGetTrendingMovies.mockResolvedValue({ results: movies });

    // Movie 2, 4 はストリーミングのみ
    mockGetMovieReleaseDates.mockImplementation((movieId: number) => {
      if (movieId === 2 || movieId === 4) {
        return Promise.resolve(streamingOnlyReleaseDates);
      }
      return Promise.resolve(theatricalReleaseDates);
    });

    const result = await syncTrendingMovies();

    expect(result.synced).toBe(3);
    const rpcMovies = mockRpc.mock.calls[0][1].movies;
    expect(
      rpcMovies.map((m: { tmdb_movie_id: number }) => m.tmdb_movie_id),
    ).toEqual([1, 3, 5]);
    // display_orderが連番になる
    expect(
      rpcMovies.map((m: { display_order: number }) => m.display_order),
    ).toEqual([1, 2, 3]);
  });

  it('US劇場公開のみでJP公開なしの場合は除外される', async () => {
    mockGetTrendingMovies.mockResolvedValue({
      results: createTrendingMovies(1),
    });
    mockGetMovieReleaseDates.mockResolvedValue([
      {
        iso_3166_1: 'US',
        release_dates: [{ type: 2, release_date: '2026-03-01' }],
      },
    ]);

    const result = await syncTrendingMovies();
    expect(result.synced).toBe(0);
  });

  it('JP劇場公開ありの作品は含まれる', async () => {
    mockGetTrendingMovies.mockResolvedValue({
      results: createTrendingMovies(1),
    });
    mockGetMovieReleaseDates.mockResolvedValue([
      {
        iso_3166_1: 'JP',
        release_dates: [{ type: 3, release_date: '2026-03-01' }],
      },
    ]);

    const result = await syncTrendingMovies();
    expect(result.synced).toBe(1);
  });

  it('リリース日取得失敗時は安全側に倒して含める', async () => {
    mockGetTrendingMovies.mockResolvedValue({
      results: createTrendingMovies(1),
    });
    mockGetMovieReleaseDates.mockRejectedValue(new Error('API error'));

    const result = await syncTrendingMovies();
    expect(result.synced).toBe(1);
  });

  it('取得結果が0件の場合DBへの書き込みをスキップする', async () => {
    mockGetTrendingMovies.mockResolvedValue({ results: [] });

    const result = await syncTrendingMovies();

    expect(result.fetched).toBe(0);
    expect(result.synced).toBe(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('全てストリーミングの場合は0件でDB書き込みをスキップする', async () => {
    mockGetTrendingMovies.mockResolvedValue({
      results: createTrendingMovies(3),
    });
    mockGetMovieReleaseDates.mockResolvedValue(streamingOnlyReleaseDates);

    const result = await syncTrendingMovies();

    expect(result.fetched).toBe(3);
    expect(result.synced).toBe(0);
    expect(mockRpc).not.toHaveBeenCalled();
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

    const rpcMovies = mockRpc.mock.calls[0][1].movies;
    expect(rpcMovies[0].release_date).toBeNull();
  });

  it('TMDb API取得失敗時はエラーをスローし既存データを保持する', async () => {
    mockGetTrendingMovies.mockRejectedValue(new Error('API error'));

    await expect(syncTrendingMovies()).rejects.toThrow('API error');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
