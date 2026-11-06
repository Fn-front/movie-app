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
 * `movie_streaming_status` の保存済み行を作る
 *
 * 既定は「配信なしで確認済み」。`checked_at` の新しさで引き直すか決まるため
 * （#960）、呼び出し側で必ず指定する
 */
const storedRow = (overrides: {
  checked_at: string;
  flatrate_provider_ids?: number[];
  paid_provider_ids?: number[];
  flatrate_since?: string | null;
  paid_since?: string | null;
  flatrate_last_seen_at?: string | null;
  paid_last_seen_at?: string | null;
  flatrate_resumed?: boolean;
  paid_resumed?: boolean;
}) => ({
  tmdb_movie_id: 12345,
  flatrate_provider_ids: overrides.flatrate_provider_ids ?? [],
  paid_provider_ids: overrides.paid_provider_ids ?? [],
  flatrate_since: overrides.flatrate_since ?? null,
  paid_since: overrides.paid_since ?? null,
  flatrate_last_seen_at: overrides.flatrate_last_seen_at ?? null,
  paid_last_seen_at: overrides.paid_last_seen_at ?? null,
  flatrate_resumed: overrides.flatrate_resumed ?? false,
  paid_resumed: overrides.paid_resumed ?? false,
  checked_at: overrides.checked_at,
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
   * 他ユーザーが先に追加していて、行がまだ新しければ問い合わせない
   */
  it('新しい行があればTMDbに問い合わせない', async () => {
    const supabase = createSupabase({
      // 1日前に確認済み（しきい値は7日）
      data: storedRow({ checked_at: '2026-11-03T12:00:00.000Z' }),
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

  describe('古い行の引き直し（#960）', () => {
    /**
     * Cron が更新するのは「誰かのウォッチリストにあって未視聴」の作品だけ。
     * 全員が視聴済みにすると行が取り残され、その間に配信が始まっても
     * 行があるせいで引き直されなかった
     */
    it('しきい値より古い行は引き直す', async () => {
      const supabase = createSupabase({
        // 8日前（しきい値は7日）
        data: storedRow({ checked_at: '2026-10-27T12:00:00.000Z' }),
        error: null,
      });
      mockGetJpStreamingAvailability.mockResolvedValue(
        availability({ flatrate: [84] }),
      );

      const outcome = await initMovieStreamingStatus(
        supabase.client,
        12345,
        NOW,
      );

      expect(outcome).toBe('initialized');
      expect(mockGetJpStreamingAvailability).toHaveBeenCalledWith(12345);
      expect(supabase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ flatrate_provider_ids: [84] }),
        expect.anything(),
      );
    });

    it('しきい値ちょうど（7日前）は古いものとして引き直す', async () => {
      const supabase = createSupabase({
        data: storedRow({ checked_at: '2026-10-28T12:00:00.000Z' }),
        error: null,
      });
      mockGetJpStreamingAvailability.mockResolvedValue(availability({}));

      const outcome = await initMovieStreamingStatus(
        supabase.client,
        12345,
        NOW,
      );

      expect(outcome).toBe('initialized');
    });

    it('しきい値の直前（7日未満）は引き直さない', async () => {
      const supabase = createSupabase({
        data: storedRow({ checked_at: '2026-10-28T12:00:00.001Z' }),
        error: null,
      });

      const outcome = await initMovieStreamingStatus(
        supabase.client,
        12345,
        NOW,
      );

      expect(outcome).toBe('skipped');
      expect(mockGetJpStreamingAvailability).not.toHaveBeenCalled();
    });

    it('checked_at が壊れていたら引き直す', async () => {
      const supabase = createSupabase({
        data: storedRow({ checked_at: 'not-a-date' }),
        error: null,
      });
      mockGetJpStreamingAvailability.mockResolvedValue(availability({}));

      const outcome = await initMovieStreamingStatus(
        supabase.client,
        12345,
        NOW,
      );

      expect(outcome).toBe('initialized');
    });

    it('引き直すとき、既存の配信履歴を前回値として渡す', async () => {
      // 両方 null で渡すと、ずっと配信中だった作品まで「いま検知した」扱いに
      // なって配信優先ソートの先頭に割り込む
      const supabase = createSupabase({
        data: storedRow({
          checked_at: '2026-10-01T12:00:00.000Z',
          flatrate_provider_ids: [84],
          flatrate_since: '2026-09-01T00:00:00.000Z',
          flatrate_last_seen_at: '2026-10-01T12:00:00.000Z',
        }),
        error: null,
      });
      mockGetJpStreamingAvailability.mockResolvedValue(
        availability({ flatrate: [84] }),
      );

      await initMovieStreamingStatus(supabase.client, 12345, NOW);

      expect(supabase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          // 継続配信なので since は据え置き（now に書き換わらない）
          flatrate_since: '2026-09-01T00:00:00.000Z',
          flatrate_resumed: false,
        }),
        expect.anything(),
      );
    });

    /**
     * 引き直し経路では「7日間見えなかった」が成立しない。
     * 7日間**一度も観測していない**だけで、配信が途切れた証拠ではない。
     *
     * 抑止しないと、引き直しのしきい値（7日）と
     * STREAMING_RESUME_THRESHOLD_DAYS（7日）が同値のため
     * 再配信判定が構造的に必ず成立してしまう
     */
    it('引き直しでは再配信と判定しない（since も動かさない）', async () => {
      const supabase = createSupabase({
        // 配信が一度見えなくなった状態で取り残された行
        data: storedRow({
          checked_at: '2026-10-01T12:00:00.000Z',
          flatrate_provider_ids: [],
          flatrate_since: '2026-05-01T00:00:00.000Z',
          flatrate_last_seen_at: '2026-09-20T00:00:00.000Z',
        }),
        error: null,
      });
      // いま引き直すと配信中だった
      mockGetJpStreamingAvailability.mockResolvedValue(
        availability({ flatrate: [84] }),
      );

      await initMovieStreamingStatus(supabase.client, 12345, NOW);

      expect(supabase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          flatrate_provider_ids: [84],
          // 再配信グループへ降格させない
          flatrate_resumed: false,
          // 元の配信開始日時を保つ（now に書き換えない）
          flatrate_since: '2026-05-01T00:00:00.000Z',
        }),
        expect.anything(),
      );
    });

    it('行が無い場合は従来どおり初配信として扱う（#942 の挙動）', async () => {
      const supabase = createSupabase({ data: null, error: null });
      mockGetJpStreamingAvailability.mockResolvedValue(
        availability({ flatrate: [84] }),
      );

      await initMovieStreamingStatus(supabase.client, 12345, NOW);

      expect(supabase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          flatrate_since: NOW.toISOString(),
          flatrate_resumed: false,
        }),
        expect.anything(),
      );
    });

    it('古い行の引き直しでは上書きする（ignoreDuplicates を外す）', async () => {
      const supabase = createSupabase({
        data: storedRow({ checked_at: '2026-10-01T12:00:00.000Z' }),
        error: null,
      });
      mockGetJpStreamingAvailability.mockResolvedValue(availability({}));

      await initMovieStreamingStatus(supabase.client, 12345, NOW);

      expect(supabase.upsert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ ignoreDuplicates: false }),
      );
    });

    it('行が無いときは競合時に何もしない（ignoreDuplicates を付ける）', async () => {
      // 間に Cron が作った行を黙って上書きしないため
      const supabase = createSupabase({ data: null, error: null });
      mockGetJpStreamingAvailability.mockResolvedValue(availability({}));

      await initMovieStreamingStatus(supabase.client, 12345, NOW);

      expect(supabase.upsert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ ignoreDuplicates: true }),
      );
    });
  });
});
