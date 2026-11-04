/**
 * @jest-environment node
 */

import {
  createRunningJob,
  findJobById,
  findLatestJob,
  findRunningJob,
  finishJobIfRunning,
  isJobStale,
  isJobStillRunning,
  type AwardSyncJob,
} from './awardSyncJob';
import { AWARD_SYNC_STALE_MINUTES } from '@/constants/awardSync';
import { MS_PER_MINUTE } from '@/constants/time';

const JOB_ID = '11111111-1111-4111-8111-111111111111';

const baseJob: AwardSyncJob = {
  id: JOB_ID,
  awardName: 'cannes',
  awardYear: 2024,
  status: 'running',
  totalUpserted: null,
  errorMessage: null,
  warningMessage: null,
  createdAt: '2026-10-31T00:00:00.000Z',
  startedAt: '2026-10-31T00:00:00.000Z',
  finishedAt: null,
};

/** update(...).eq('id').eq('status').select('id') の鎖をモックする */
function createUpdateMock(result: { data: unknown; error: unknown }) {
  const select = jest.fn().mockResolvedValue(result);
  const eqStatus = jest.fn(() => ({ select }));
  const eqId = jest.fn(() => ({ eq: eqStatus }));
  // mock.calls から取ると引数型が [] と推論されるため、ここで捕捉する
  const patches: Record<string, unknown>[] = [];
  const update = jest.fn((patch: Record<string, unknown>) => {
    patches.push(patch);
    return { eq: eqId };
  });
  const supabase = {
    from: jest.fn(() => ({ update })),
  } as unknown as Parameters<typeof finishJobIfRunning>[0];

  return { supabase, update, patches, eqId, eqStatus };
}

describe('isJobStale', () => {
  it('閾値未満なら false', () => {
    const now = new Date(
      Date.parse(baseJob.startedAt) +
        (AWARD_SYNC_STALE_MINUTES - 1) * MS_PER_MINUTE,
    );

    expect(isJobStale(baseJob, now)).toBe(false);
  });

  it('閾値ちょうどで true', () => {
    const now = new Date(
      Date.parse(baseJob.startedAt) + AWARD_SYNC_STALE_MINUTES * MS_PER_MINUTE,
    );

    expect(isJobStale(baseJob, now)).toBe(true);
  });

  it('終端状態のジョブは stale 扱いしない', () => {
    const now = new Date('2026-11-01T00:00:00.000Z');

    expect(isJobStale({ ...baseJob, status: 'succeeded' }, now)).toBe(false);
    expect(isJobStale({ ...baseJob, status: 'failed' }, now)).toBe(false);
  });
});

describe('finishJobIfRunning', () => {
  it('status=running の行だけを更新する', async () => {
    const { supabase, patches, eqId, eqStatus } = createUpdateMock({
      data: [{ id: JOB_ID }],
      error: null,
    });

    const updated = await finishJobIfRunning(supabase, JOB_ID, {
      status: 'succeeded',
      totalUpserted: 12,
    });

    expect(updated).toBe(true);
    expect(eqId).toHaveBeenCalledWith('id', JOB_ID);
    expect(eqStatus).toHaveBeenCalledWith('status', 'running');
    expect(patches[0]).toMatchObject({
      status: 'succeeded',
      total_upserted: 12,
      error_message: null,
      warning_message: null,
    });
  });

  it('警告を付けて succeeded にできる（旧世代が消せなかったとき）', async () => {
    const { supabase, patches } = createUpdateMock({
      data: [{ id: JOB_ID }],
      error: null,
    });

    const updated = await finishJobIfRunning(supabase, JOB_ID, {
      status: 'succeeded',
      totalUpserted: 12,
      warningMessage: '旧世代の削除に失敗しました: timeout',
    });

    expect(updated).toBe(true);
    expect(patches[0]).toMatchObject({
      status: 'succeeded',
      total_upserted: 12,
      // 失敗ではないので error_message は空のまま
      error_message: null,
      warning_message: '旧世代の削除に失敗しました: timeout',
    });
  });

  /**
   * 強制失効されたジョブが succeeded に化けないことを保証する。
   * ここが 0 行更新を false で返さないと、失効済みプロセスが
   * 新しいジョブと並走して書き込む経路に気づけない。
   */
  it('0行更新なら false を返す（強制失効されていた）', async () => {
    const { supabase } = createUpdateMock({ data: [], error: null });

    expect(
      await finishJobIfRunning(supabase, JOB_ID, {
        status: 'succeeded',
        totalUpserted: 12,
      }),
    ).toBe(false);
  });

  it('DBエラーなら false を返す', async () => {
    const { supabase } = createUpdateMock({
      data: null,
      error: { message: 'boom' },
    });

    expect(
      await finishJobIfRunning(supabase, JOB_ID, {
        status: 'failed',
        errorMessage: 'x',
      }),
    ).toBe(false);
  });
});

describe('isJobStillRunning', () => {
  function createSelectMock(data: unknown) {
    const maybeSingle = jest.fn().mockResolvedValue({ data });
    const eqStatus = jest.fn(() => ({ maybeSingle }));
    const eqId = jest.fn(() => ({ eq: eqStatus }));
    const select = jest.fn(() => ({ eq: eqId }));
    const supabase = {
      from: jest.fn(() => ({ select })),
    } as unknown as Parameters<typeof isJobStillRunning>[0];

    return { supabase, eqId, eqStatus };
  }

  it('running の行があれば true', async () => {
    const { supabase, eqId, eqStatus } = createSelectMock({ id: JOB_ID });

    expect(await isJobStillRunning(supabase, JOB_ID)).toBe(true);
    expect(eqId).toHaveBeenCalledWith('id', JOB_ID);
    expect(eqStatus).toHaveBeenCalledWith('status', 'running');
  });

  it('行が無ければ false', async () => {
    const { supabase } = createSelectMock(null);

    expect(await isJobStillRunning(supabase, JOB_ID)).toBe(false);
  });
});

describe('ジョブの検索', () => {
  /** 直近の `.select()` に渡された文字列。カラムの取り漏れを検知する */
  let selectedColumns: string | undefined;

  beforeEach(() => {
    selectedColumns = undefined;
  });

  const ROW = {
    id: JOB_ID,
    award_name: 'cannes',
    award_year: 2024,
    status: 'running' as const,
    total_upserted: null,
    error_message: null,
    warning_message: null,
    created_at: baseJob.createdAt,
    started_at: baseJob.startedAt,
    finished_at: null,
  };

  /** select(...).eq(...).maybeSingle() の鎖 */
  function createEqMock(data: unknown) {
    const maybeSingle = jest.fn().mockResolvedValue({ data });
    const eq = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn((columns: string) => {
      selectedColumns = columns;
      return { eq };
    });
    const supabase = {
      from: jest.fn(() => ({ select })),
    } as unknown as Parameters<typeof findRunningJob>[0];

    return { supabase, eq, select };
  }

  /** select(...).order(...).limit(...).maybeSingle() の鎖 */
  function createOrderMock(data: unknown) {
    const maybeSingle = jest.fn().mockResolvedValue({ data });
    const limit = jest.fn(() => ({ maybeSingle }));
    const order = jest.fn(() => ({ limit }));
    const select = jest.fn(() => ({ order }));
    const supabase = {
      from: jest.fn(() => ({ select })),
    } as unknown as Parameters<typeof findLatestJob>[0];

    return { supabase, order, limit };
  }

  it('ジョブの組み立てに必要なカラムをすべて SELECT する', async () => {
    // 型は守ってくれない（toJob が row をキャストで受けるため）。
    // 落とすと該当項目が undefined のまま JSON から消え、機能が静かに無効化される
    const { supabase } = createEqMock(ROW);

    await findRunningJob(supabase);

    for (const column of [
      'id',
      'award_name',
      'award_year',
      'status',
      'total_upserted',
      'error_message',
      'warning_message',
      'created_at',
      'started_at',
      'finished_at',
    ]) {
      expect(selectedColumns).toContain(column);
    }
  });

  it('findRunningJob は running で絞り、スネークケースを変換して返す', async () => {
    const { supabase, eq } = createEqMock(ROW);

    const job = await findRunningJob(supabase);

    expect(eq).toHaveBeenCalledWith('status', 'running');
    expect(job).toEqual(baseJob);
  });

  it('findRunningJob は該当なしで null を返す', async () => {
    const { supabase } = createEqMock(null);

    expect(await findRunningJob(supabase)).toBeNull();
  });

  it('findJobById は id で絞る', async () => {
    const { supabase, eq } = createEqMock(ROW);

    const job = await findJobById(supabase, JOB_ID);

    expect(eq).toHaveBeenCalledWith('id', JOB_ID);
    expect(job?.id).toBe(JOB_ID);
  });

  it('findJobById は該当なしで null を返す', async () => {
    const { supabase } = createEqMock(null);

    expect(await findJobById(supabase, JOB_ID)).toBeNull();
  });

  it('findLatestJob は作成日時の降順で1件取る', async () => {
    const { supabase, order, limit } = createOrderMock(ROW);

    const job = await findLatestJob(supabase);

    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(limit).toHaveBeenCalledWith(1);
    expect(job).toEqual(baseJob);
  });

  it('findLatestJob は1件も無ければ null を返す', async () => {
    const { supabase } = createOrderMock(null);

    expect(await findLatestJob(supabase)).toBeNull();
  });
});

describe('createRunningJob', () => {
  function createInsertMock(result: { data: unknown; error: unknown }) {
    const single = jest.fn().mockResolvedValue(result);
    const select = jest.fn(() => ({ single }));
    // mock.calls から取ると引数型が [] と推論されるため、ここで捕捉する
    const rows: Record<string, unknown>[] = [];
    const insert = jest.fn((row: Record<string, unknown>) => {
      rows.push(row);
      return { select };
    });
    const supabase = {
      from: jest.fn(() => ({ insert })),
    } as unknown as Parameters<typeof createRunningJob>[0];

    return { supabase, rows };
  }

  it('running として起票する', async () => {
    const { supabase, rows } = createInsertMock({
      data: {
        id: JOB_ID,
        award_name: 'cannes',
        award_year: 2024,
        status: 'running',
        total_upserted: null,
        error_message: null,
        created_at: baseJob.createdAt,
        started_at: baseJob.startedAt,
        finished_at: null,
      },
      error: null,
    });

    const result = await createRunningJob(supabase, {
      awardName: 'cannes',
      year: 2024,
      requestedBy: 'admin-1',
    });

    expect('job' in result && result.job.id).toBe(JOB_ID);
    expect(rows[0]).toEqual({
      award_name: 'cannes',
      award_year: 2024,
      status: 'running',
      requested_by: 'admin-1',
    });
  });

  /**
   * 部分ユニークインデックスが2件目を弾いたときに 500 にしない。
   * 事前チェックと INSERT の間に別リクエストが入る競合をここで吸収する。
   */
  it('23505 を conflict として返す', async () => {
    const { supabase } = createInsertMock({
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    });

    const result = await createRunningJob(supabase, {
      awardName: 'cannes',
      year: 2024,
      requestedBy: 'admin-1',
    });

    expect(result).toEqual({ conflict: true });
  });

  it('23505 以外のエラーは投げる', async () => {
    const { supabase } = createInsertMock({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });

    await expect(
      createRunningJob(supabase, {
        awardName: 'cannes',
        year: 2024,
        requestedBy: 'admin-1',
      }),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
