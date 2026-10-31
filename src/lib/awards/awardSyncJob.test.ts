/**
 * @jest-environment node
 */

import {
  createRunningJob,
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
