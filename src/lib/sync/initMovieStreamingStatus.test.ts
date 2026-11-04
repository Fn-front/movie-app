/**
 * @jest-environment node
 */

/**
 * ウォッチリスト追加時の配信状況の初期化 テスト
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { initMovieStreamingStatus } from './initMovieStreamingStatus';

// --- Mocks ---

const mockGetJpStreamingAvailability = jest.fn();
jest.mock('@/lib/tmdb/tmdb', () => ({
  getJpStreamingAvailability: (...args: unknown[]) =>
    mockGetJpStreamingAvailability(...args),
}));

// --- Helpers ---

const NOW = new Date('2026-11-04T12:00:00.000Z');

/** TMDb の戻り値（提供形態ごとのプロバイダーID） */
const availability = (providers: {
  flatrate?: number[];
  rent?: number[];
  buy?: number[];
}) => ({
  isCurrentlyStreaming: true,
  digitalReleaseDate: null,
  keywordIds: [],
  watchProviderIds: {
    flatrate: providers.flatrate ?? [],
    rent: providers.rent ?? [],
    buy: providers.buy ?? [],
  },
});

/**
 * `from('movie_streaming_status')` の select / upsert を差し替えたクライアントを作る
 *
 * @param existing - 既存行の検索結果
 * @param upsertError - upsert のエラー（既定は成功）
 */
function createSupabase(
  existing: { data: unknown; error: unknown },
  upsertError: unknown = null,
) {
  const maybeSingle = jest.fn().mockResolvedValue(existing);
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const upsert = jest.fn().mockResolvedValue({ error: upsertError });
  const from = jest.fn().mockReturnValue({ select, upsert });

  return {
    client: { from } as unknown as SupabaseClient,
    from,
    select,
    eq,
    upsert,
  };
}

// console.error はテスト出力を汚すだけなので黙らせる
let consoleError: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

// --- Tests ---

describe('initMovieStreamingStatus', () => {
  it('行が無ければTMDbに問い合わせて配信状況を保存する', async () => {
    const supabase = createSupabase({ data: null, error: null });
    mockGetJpStreamingAvailability.mockResolvedValue(
      availability({ flatrate: [84] }),
    );

    const outcome = await initMovieStreamingStatus(supabase.client, 12345, NOW);

    expect(outcome).toBe('initialized');
    expect(mockGetJpStreamingAvailability).toHaveBeenCalledWith(12345);
    // 「1作品につきTMDbは1回だけ」は Issue の完了条件なので回数まで固定する
    expect(mockGetJpStreamingAvailability).toHaveBeenCalledTimes(1);
    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        tmdb_movie_id: 12345,
        flatrate_provider_ids: [84],
        paid_provider_ids: [],
      }),
      { onConflict: 'tmdb_movie_id', ignoreDuplicates: true },
    );
  });

  /**
   * SELECT と書き込みの間に Cron や他リクエストが行を作ることがある。
   * この関数の役目は「無ければ作る」だけなので、競合したら何もしないのが正しい。
   * 既定の merge-duplicates だと相手の行を黙って上書きしてしまう
   */
  it('競合時に既存行を上書きしない（ON CONFLICT DO NOTHING）', async () => {
    const supabase = createSupabase({ data: null, error: null });
    mockGetJpStreamingAvailability.mockResolvedValue(
      availability({ flatrate: [84] }),
    );

    await initMovieStreamingStatus(supabase.client, 12345, NOW);

    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ignoreDuplicates: true }),
    );
  });

  /**
   * `since` には追加時刻を入れる。Cron がその作品を初めて取り込んだときと
   * 同じ扱いで、配信優先ソート（#899）の先頭グループに入る
   */
  it('since と last_seen_at に追加時刻を入れる', async () => {
    const supabase = createSupabase({ data: null, error: null });
    mockGetJpStreamingAvailability.mockResolvedValue(
      availability({ flatrate: [84] }),
    );

    await initMovieStreamingStatus(supabase.client, 12345, NOW);

    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        flatrate_since: NOW.toISOString(),
        flatrate_last_seen_at: NOW.toISOString(),
        flatrate_resumed: false,
        checked_at: NOW.toISOString(),
      }),
      expect.anything(),
    );
  });

  // rent と buy は UI 上どちらも「レンタル」で足りるためまとめる
  it('rent と buy をまとめて paid にする', async () => {
    const supabase = createSupabase({ data: null, error: null });
    mockGetJpStreamingAvailability.mockResolvedValue(
      availability({ rent: [10, 11], buy: [11, 12] }),
    );

    await initMovieStreamingStatus(supabase.client, 12345, NOW);

    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        flatrate_provider_ids: [],
        paid_provider_ids: [10, 11, 12],
        paid_since: NOW.toISOString(),
      }),
      expect.anything(),
    );
  });

  // 「確認済みで配信なし」を残せば、別ユーザーの追加で引き直さずに済む
  it('配信が無くても行は作る（since は null のまま）', async () => {
    const supabase = createSupabase({ data: null, error: null });
    mockGetJpStreamingAvailability.mockResolvedValue(availability({}));

    const outcome = await initMovieStreamingStatus(supabase.client, 12345, NOW);

    expect(outcome).toBe('initialized');
    expect(supabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        flatrate_provider_ids: [],
        paid_provider_ids: [],
        flatrate_since: null,
        paid_since: null,
      }),
      expect.anything(),
    );
  });

  /**
   * movie_streaming_status は作品単位の共有テーブル。
   * 他ユーザーが先に追加していれば行があるので問い合わせない
   */
  it('すでに行があればTMDbに問い合わせない', async () => {
    const supabase = createSupabase({
      data: { tmdb_movie_id: 12345 },
      error: null,
    });

    const outcome = await initMovieStreamingStatus(supabase.client, 12345, NOW);

    expect(outcome).toBe('skipped');
    expect(mockGetJpStreamingAvailability).not.toHaveBeenCalled();
    expect(supabase.upsert).not.toHaveBeenCalled();
  });

  it('対象の映画IDで既存行を引く', async () => {
    const supabase = createSupabase({ data: null, error: null });
    mockGetJpStreamingAvailability.mockResolvedValue(availability({}));

    await initMovieStreamingStatus(supabase.client, 12345, NOW);

    expect(supabase.from).toHaveBeenCalledWith('movie_streaming_status');
    expect(supabase.eq).toHaveBeenCalledWith('tmdb_movie_id', 12345);
  });

  // バッジが出ないだけで追加操作が失敗する方が困るため、例外にしない
  it('TMDb問い合わせに失敗しても例外を投げず failed を返す', async () => {
    const supabase = createSupabase({ data: null, error: null });
    mockGetJpStreamingAvailability.mockRejectedValue(new Error('TMDb 503'));

    const outcome = await initMovieStreamingStatus(supabase.client, 12345, NOW);

    expect(outcome).toBe('failed');
    expect(supabase.upsert).not.toHaveBeenCalled();
  });

  it('Error 以外で失敗しても例外を投げず failed を返す', async () => {
    const supabase = createSupabase({ data: null, error: null });
    mockGetJpStreamingAvailability.mockRejectedValue('文字列の例外');

    const outcome = await initMovieStreamingStatus(supabase.client, 12345, NOW);

    expect(outcome).toBe('failed');
  });

  // 呼び出し側（POST /api/watchlist）は now を渡さない
  it('now を省略すると実行時刻を使う', async () => {
    const supabase = createSupabase({ data: null, error: null });
    mockGetJpStreamingAvailability.mockResolvedValue(
      availability({ flatrate: [84] }),
    );

    const before = Date.now();
    await initMovieStreamingStatus(supabase.client, 12345);
    const after = Date.now();

    const saved = supabase.upsert.mock.calls[0][0] as { checked_at: string };
    const checkedAt = new Date(saved.checked_at).getTime();
    expect(checkedAt).toBeGreaterThanOrEqual(before);
    expect(checkedAt).toBeLessThanOrEqual(after);
  });

  it('既存行の検索に失敗しても例外を投げず failed を返す', async () => {
    const supabase = createSupabase({
      data: null,
      error: { message: 'db error' },
    });

    const outcome = await initMovieStreamingStatus(supabase.client, 12345, NOW);

    expect(outcome).toBe('failed');
    expect(mockGetJpStreamingAvailability).not.toHaveBeenCalled();
  });

  it('保存に失敗しても例外を投げず failed を返す', async () => {
    const supabase = createSupabase(
      { data: null, error: null },
      {
        message: 'upsert failed',
      },
    );
    mockGetJpStreamingAvailability.mockResolvedValue(
      availability({ flatrate: [84] }),
    );

    const outcome = await initMovieStreamingStatus(supabase.client, 12345, NOW);

    expect(outcome).toBe('failed');
  });
});
