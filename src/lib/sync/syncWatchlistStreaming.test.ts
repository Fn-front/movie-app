/**
 * ウォッチリストの配信状況 同期処理 テスト
 */

import { syncWatchlistStreaming } from './syncWatchlistStreaming';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}));

const mockGetJpStreamingAvailability = jest.fn();
jest.mock('@/lib/tmdb/tmdb', () => ({
  getJpStreamingAvailability: (...args: unknown[]) =>
    mockGetJpStreamingAvailability(...args),
}));

// --- Helpers ---

/** upsert に渡された行を記録する */
const upsertedRows: Array<Record<string, unknown>> = [];

/** watchlist の取得 → movie_streaming_status の取得 → upsert をモックする */
const mockTables = (options: {
  watchlistRows: Array<{ tmdb_movie_id: number }>;
  statusRows?: Array<Record<string, unknown>>;
  upsertError?: { message: string } | null;
}) => {
  mockFrom.mockReset();
  upsertedRows.length = 0;

  mockFrom.mockImplementation((table: string) => {
    if (table === 'watchlist') {
      return {
        select: () => ({
          is: () => ({
            is: () =>
              Promise.resolve({ data: options.watchlistRows, error: null }),
          }),
        }),
      };
    }
    if (table === 'movie_streaming_status') {
      return {
        select: () => ({
          in: () =>
            Promise.resolve({ data: options.statusRows ?? [], error: null }),
        }),
        upsert: (rows: Array<Record<string, unknown>>) => {
          upsertedRows.push(...rows);
          return Promise.resolve({ error: options.upsertError ?? null });
        },
      };
    }
    throw new Error(`想定外のテーブル: ${table}`);
  });
};

const availability = (
  flatrate: number[],
  rent: number[] = [],
  buy: number[] = [],
) => ({
  isCurrentlyStreaming: flatrate.length + rent.length + buy.length > 0,
  digitalReleaseDate: null,
  keywordIds: [],
  watchProviderIds: { flatrate, rent, buy },
});

// --- Tests ---

describe('syncWatchlistStreaming', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  });

  it('未視聴の作品を重複排除して問い合わせる', async () => {
    mockTables({
      watchlistRows: [
        { tmdb_movie_id: 100 },
        { tmdb_movie_id: 100 },
        { tmdb_movie_id: 200 },
      ],
    });
    mockGetJpStreamingAvailability.mockResolvedValue(availability([8]));

    const result = await syncWatchlistStreaming();

    expect(result.targets).toBe(2);
    expect(mockGetJpStreamingAvailability).toHaveBeenCalledTimes(2);
  });

  it('rent と buy をまとめて paid として保存する', async () => {
    mockTables({ watchlistRows: [{ tmdb_movie_id: 100 }] });
    mockGetJpStreamingAvailability.mockResolvedValue(
      availability([], [84], [10]),
    );

    await syncWatchlistStreaming();

    const row = upsertedRows[0];
    expect(row.flatrate_provider_ids).toEqual([]);
    expect(row.paid_provider_ids).toEqual([84, 10]);
  });

  it('rent と buy に同じプロバイダーがいても重複させない', async () => {
    mockTables({ watchlistRows: [{ tmdb_movie_id: 100 }] });
    mockGetJpStreamingAvailability.mockResolvedValue(
      availability([], [84], [84]),
    );

    await syncWatchlistStreaming();

    expect(upsertedRows[0].paid_provider_ids).toEqual([84]);
  });

  it('初めて配信を確認した作品を newlyAvailable に数える', async () => {
    mockTables({ watchlistRows: [{ tmdb_movie_id: 100 }] });
    mockGetJpStreamingAvailability.mockResolvedValue(availability([8]));

    const result = await syncWatchlistStreaming();

    expect(result.newlyAvailable).toBe(1);
    expect(upsertedRows[0].flatrate_since).toEqual(expect.any(String));
  });

  it('既に配信中の作品は since を引き継ぐ', async () => {
    const existingSince = '2026-01-01T00:00:00.000Z';
    mockTables({
      watchlistRows: [{ tmdb_movie_id: 100 }],
      statusRows: [
        {
          tmdb_movie_id: 100,
          flatrate_provider_ids: [8],
          paid_provider_ids: [],
          flatrate_since: existingSince,
          paid_since: null,
          flatrate_last_seen_at: '2026-10-31T00:00:00.000Z',
          paid_last_seen_at: null,
          flatrate_resumed: false,
          paid_resumed: false,
        },
      ],
    });
    mockGetJpStreamingAvailability.mockResolvedValue(availability([8]));

    const result = await syncWatchlistStreaming();

    expect(upsertedRows[0].flatrate_since).toBe(existingSince);
    expect(result.newlyAvailable).toBe(0);
  });

  it('TMDb の問い合わせに失敗した作品は更新しない（空に倒さない）', async () => {
    mockTables({
      watchlistRows: [{ tmdb_movie_id: 100 }, { tmdb_movie_id: 200 }],
    });
    mockGetJpStreamingAvailability
      .mockResolvedValueOnce(availability([8]))
      .mockRejectedValueOnce(new Error('TMDb error'));

    const result = await syncWatchlistStreaming();

    expect(result.failed).toBe(1);
    expect(result.updated).toBe(1);
    expect(upsertedRows).toHaveLength(1);
    expect(upsertedRows[0].tmdb_movie_id).toBe(100);
  });

  it('対象が0件なら TMDb を呼ばない', async () => {
    mockTables({ watchlistRows: [] });

    const result = await syncWatchlistStreaming();

    expect(result.targets).toBe(0);
    expect(mockGetJpStreamingAvailability).not.toHaveBeenCalled();
  });

  it('upsert が失敗したらエラーを記録する', async () => {
    mockTables({
      watchlistRows: [{ tmdb_movie_id: 100 }],
      upsertError: { message: 'boom' },
    });
    mockGetJpStreamingAvailability.mockResolvedValue(availability([8]));

    const result = await syncWatchlistStreaming();

    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('Supabase の環境変数が無ければ例外を投げる', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    await expect(syncWatchlistStreaming()).rejects.toThrow(
      'Supabase環境変数が設定されていません',
    );
  });
});
