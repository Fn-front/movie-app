/**
 * @jest-environment node
 */

import { executeManualAwardSync } from './manualAwardSync';
import { AWARD_SYNC_MESSAGES } from '@/constants/awardSync';

const mockFetchAndResolveAward = jest.fn();
jest.mock('./syncAwardMoviesService', () => ({
  // 競合キーは cron 側と同じ定数を使う。ここで実値を持たせることで、
  // manualAwardSync が独自の文字列を書いたら検知できる
  AWARD_MOVIES_CONFLICT_TARGET:
    'tmdb_movie_id,award_name,award_year,category,person_name',
  fetchAndResolveAward: (...args: unknown[]) =>
    mockFetchAndResolveAward(...args),
}));

const mockFinishJobIfRunning = jest.fn();
const mockIsJobStillRunning = jest.fn();
jest.mock('./awardSyncJob', () => ({
  finishJobIfRunning: (...args: unknown[]) => mockFinishJobIfRunning(...args),
  isJobStillRunning: (...args: unknown[]) => mockIsJobStillRunning(...args),
}));

const JOB_ID = '11111111-1111-4111-8111-111111111111';

const ROWS = [
  {
    tmdb_movie_id: 1,
    award_name: 'cannes',
    award_year: 2024,
    category: 'palme_dor',
    generated_at: 'X',
  },
];

/** award_movies の upsert / delete をモックする */
function createSupabase(options?: {
  upsertError?: { message: string } | null;
  deleteError?: { message: string } | null;
}) {
  const upsert = jest
    .fn()
    .mockResolvedValue({ error: options?.upsertError ?? null });
  const lt = jest
    .fn()
    .mockResolvedValue({ error: options?.deleteError ?? null });
  const eqYear = jest.fn(() => ({ lt }));
  const eqName = jest.fn(() => ({ eq: eqYear }));
  const del = jest.fn(() => ({ eq: eqName }));
  const from = jest.fn(() => ({ upsert, delete: del }));

  return {
    supabase: from as unknown as Parameters<typeof executeManualAwardSync>[0],
    from,
    upsert,
    del,
    eqName,
    eqYear,
    lt,
  };
}

/** supabase クライアント形に包む */
function wrap(db: ReturnType<typeof createSupabase>) {
  return { from: db.from } as unknown as Parameters<
    typeof executeManualAwardSync
  >[0];
}

const params = {
  jobId: JOB_ID,
  awardName: 'cannes' as const,
  year: 2024,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockIsJobStillRunning.mockResolvedValue(true);
  mockFinishJobIfRunning.mockResolvedValue(true);
});

describe('executeManualAwardSync', () => {
  it('UPSERT してから旧世代だけを削除し、succeeded にする', async () => {
    mockFetchAndResolveAward.mockResolvedValue({ type: 'rows', rows: ROWS });
    const db = createSupabase();

    await executeManualAwardSync(wrap(db), params);

    // UPSERT が DELETE より先に走る（逆順だと失敗時に全損する）
    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect(db.del).toHaveBeenCalledTimes(1);
    expect(db.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      db.del.mock.invocationCallOrder[0],
    );

    // 削除条件は賞・年が一致し、generated_at が今回より古いものだけ
    expect(db.eqName).toHaveBeenCalledWith('award_name', 'cannes');
    expect(db.eqYear).toHaveBeenCalledWith('award_year', 2024);
    expect(db.lt).toHaveBeenCalledWith('generated_at', expect.any(String));

    expect(mockFinishJobIfRunning).toHaveBeenCalledWith(
      expect.anything(),
      JOB_ID,
      { status: 'succeeded', totalUpserted: 1 },
    );
  });

  it('UPSERT の競合キーに person_name を含める', async () => {
    mockFetchAndResolveAward.mockResolvedValue({ type: 'rows', rows: ROWS });
    const db = createSupabase();

    await executeManualAwardSync(wrap(db), params);

    expect(db.upsert.mock.calls[0][1]).toEqual({
      onConflict: 'tmdb_movie_id,award_name,award_year,category,person_name',
    });
  });

  it('取得0件なら award_movies に一切触らず failed にする', async () => {
    mockFetchAndResolveAward.mockResolvedValue({ type: 'no_items' });
    const db = createSupabase();

    await executeManualAwardSync(wrap(db), params);

    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.del).not.toHaveBeenCalled();
    expect(mockFinishJobIfRunning).toHaveBeenCalledWith(
      expect.anything(),
      JOB_ID,
      { status: 'failed', errorMessage: AWARD_SYNC_MESSAGES.NO_ITEMS },
    );
  });

  it('TMDb解決0件でも award_movies に触らない', async () => {
    mockFetchAndResolveAward.mockResolvedValue({ type: 'no_tmdb_match' });
    const db = createSupabase();

    await executeManualAwardSync(wrap(db), params);

    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.del).not.toHaveBeenCalled();
    expect(mockFinishJobIfRunning).toHaveBeenCalledWith(
      expect.anything(),
      JOB_ID,
      { status: 'failed', errorMessage: AWARD_SYNC_MESSAGES.NO_TMDB_MATCH },
    );
  });

  /**
   * この計画で最も壊すと痛い挙動。UPSERT が失敗した状態で DELETE へ進むと、
   * その賞・年のデータが消えたまま復旧しない。
   */
  it('UPSERT が失敗したら DELETE へ進まない（既存データを守る）', async () => {
    mockFetchAndResolveAward.mockResolvedValue({ type: 'rows', rows: ROWS });
    const db = createSupabase({ upsertError: { message: 'boom' } });

    await executeManualAwardSync(wrap(db), params);

    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect(db.del).not.toHaveBeenCalled();
    expect(mockFinishJobIfRunning).toHaveBeenCalledWith(
      expect.anything(),
      JOB_ID,
      {
        status: 'failed',
        errorMessage: expect.stringContaining(
          AWARD_SYNC_MESSAGES.WRITE_FAILED,
        ) as unknown as string,
      },
    );
  });

  it('強制失効されていたら書き込まずに終了する', async () => {
    mockFetchAndResolveAward.mockResolvedValue({ type: 'rows', rows: ROWS });
    mockIsJobStillRunning.mockResolvedValue(false);
    const db = createSupabase();

    await executeManualAwardSync(wrap(db), params);

    expect(db.upsert).not.toHaveBeenCalled();
    expect(db.del).not.toHaveBeenCalled();
    expect(mockFinishJobIfRunning).not.toHaveBeenCalled();
  });

  /**
   * after() のコールバックとして呼ばれる。Next は例外を握り潰すので、
   * 投げるとジョブが running のまま孤児になる。
   */
  it('例外を外へ投げず failed に倒す', async () => {
    mockFetchAndResolveAward.mockRejectedValue(new Error('network down'));
    const db = createSupabase();

    await expect(
      executeManualAwardSync(wrap(db), params),
    ).resolves.toBeUndefined();

    expect(mockFinishJobIfRunning).toHaveBeenCalledWith(
      expect.anything(),
      JOB_ID,
      {
        status: 'failed',
        errorMessage: expect.stringContaining(
          'network down',
        ) as unknown as string,
      },
    );
  });

  it('DELETE が失敗しても succeeded にする（データは新しい）', async () => {
    mockFetchAndResolveAward.mockResolvedValue({ type: 'rows', rows: ROWS });
    const db = createSupabase({ deleteError: { message: 'delete boom' } });

    await executeManualAwardSync(wrap(db), params);

    expect(mockFinishJobIfRunning).toHaveBeenCalledWith(
      expect.anything(),
      JOB_ID,
      { status: 'succeeded', totalUpserted: 1 },
    );
  });
});
