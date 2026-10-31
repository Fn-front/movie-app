/**
 * @jest-environment node
 */

import { AWARD_SYNC_MESSAGES } from '@/constants/awardSync';

// withAdminAuth は認可を通した体でハンドラをそのまま呼ぶ。
// 認可そのものは adminAuth.test.ts が担保している
const SESSION = { user: { id: 'admin-1' } };
let mockSupabase: unknown;
jest.mock('@/helpers/adminAuth', () => ({
  withAdminAuth:
    (handler: (ctx: unknown) => Promise<Response>) => (request: Request) =>
      handler({ session: SESSION, supabase: mockSupabase, request }),
}));

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockAfter = jest.fn();
jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return { ...actual, after: (cb: () => void) => mockAfter(cb) };
});

const mockFindRunningJob = jest.fn();
const mockCreateRunningJob = jest.fn();
const mockFinishJobIfRunning = jest.fn();
const mockFindLatestJob = jest.fn();
const mockIsJobStale = jest.fn();
jest.mock('@/lib/awards/awardSyncJob', () => ({
  findRunningJob: (...a: unknown[]) => mockFindRunningJob(...a),
  createRunningJob: (...a: unknown[]) => mockCreateRunningJob(...a),
  finishJobIfRunning: (...a: unknown[]) => mockFinishJobIfRunning(...a),
  findLatestJob: (...a: unknown[]) => mockFindLatestJob(...a),
  isJobStale: (...a: unknown[]) => mockIsJobStale(...a),
}));

jest.mock('@/lib/awards/manualAwardSync', () => ({
  executeManualAwardSync: jest.fn(),
}));

import { POST, GET } from './route';

const RUNNING_JOB = {
  id: 'job-1',
  awardName: 'cannes',
  awardYear: 2024,
  status: 'running' as const,
  totalUpserted: null,
  errorMessage: null,
  createdAt: '2026-10-31T00:00:00.000Z',
  startedAt: '2026-10-31T00:00:00.000Z',
  finishedAt: null,
};

const createRequest = (body: unknown) =>
  new Request('http://localhost/api/admin/awards/sync', {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockSupabase = { from: jest.fn() };
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockFindRunningJob.mockResolvedValue(null);
  mockIsJobStale.mockReturnValue(false);
  mockCreateRunningJob.mockResolvedValue({
    job: { ...RUNNING_JOB, id: 'new-job' },
  });
});

describe('POST /api/admin/awards/sync', () => {
  it('202 を返し after() で同期を予約する', async () => {
    const response = await POST(
      createRequest({ awardName: 'cannes', year: 2024 }),
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.success).toBe(true);
    expect(body.data.job.id).toBe('new-job');
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('レート制限超過で429を返し、ジョブを作らない', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

    const response = await POST(
      createRequest({ awardName: 'cannes', year: 2024 }),
    );

    expect(response.status).toBe(429);
    expect(mockCreateRunningJob).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it('同期対象外の賞を400で拒否する', async () => {
    const response = await POST(
      createRequest({ awardName: 'japan_academy_awards', year: 2024 }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateRunningJob).not.toHaveBeenCalled();
  });

  it('下限より前の年を400で拒否する', async () => {
    const response = await POST(
      createRequest({ awardName: 'cannes', year: 1945 }),
    );

    expect(response.status).toBe(400);
  });

  it('実行中ジョブがあれば409を返し、ジョブ情報を含める', async () => {
    mockFindRunningJob.mockResolvedValue(RUNNING_JOB);

    const response = await POST(
      createRequest({ awardName: 'cannes', year: 2024 }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.message).toBe(AWARD_SYNC_MESSAGES.ALREADY_RUNNING);
    expect(body.data.job.id).toBe('job-1');
    expect(body.data.isStale).toBe(false);
    expect(mockCreateRunningJob).not.toHaveBeenCalled();
  });

  it('賞・年が違っても実行中なら409を返す（全体で1件）', async () => {
    mockFindRunningJob.mockResolvedValue(RUNNING_JOB);

    const response = await POST(
      createRequest({ awardName: 'academy_awards', year: 2020 }),
    );

    expect(response.status).toBe(409);
  });

  it('force でも閾値未満なら409のまま失効させない', async () => {
    mockFindRunningJob.mockResolvedValue(RUNNING_JOB);
    mockIsJobStale.mockReturnValue(false);

    const response = await POST(
      createRequest({ awardName: 'cannes', year: 2024, force: true }),
    );

    expect(response.status).toBe(409);
    expect(mockFinishJobIfRunning).not.toHaveBeenCalled();
  });

  it('force かつ閾値超過なら旧ジョブを failed にして起票する', async () => {
    mockFindRunningJob.mockResolvedValue(RUNNING_JOB);
    mockIsJobStale.mockReturnValue(true);
    mockFinishJobIfRunning.mockResolvedValue(true);

    const response = await POST(
      createRequest({ awardName: 'cannes', year: 2024, force: true }),
    );

    expect(response.status).toBe(202);
    expect(mockFinishJobIfRunning).toHaveBeenCalledWith(mockSupabase, 'job-1', {
      status: 'failed',
      errorMessage: AWARD_SYNC_MESSAGES.SUPERSEDED,
    });
    expect(mockCreateRunningJob).toHaveBeenCalled();
  });

  it('強制失効が0行更新なら409を返す（別リクエストが先に閉じた）', async () => {
    mockFindRunningJob.mockResolvedValue(RUNNING_JOB);
    mockIsJobStale.mockReturnValue(true);
    mockFinishJobIfRunning.mockResolvedValue(false);

    const response = await POST(
      createRequest({ awardName: 'cannes', year: 2024, force: true }),
    );

    expect(response.status).toBe(409);
    expect(mockCreateRunningJob).not.toHaveBeenCalled();
  });

  it('INSERT が 23505 なら500ではなく409を返す', async () => {
    mockCreateRunningJob.mockResolvedValue({ conflict: true });
    mockFindRunningJob
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(RUNNING_JOB);

    const response = await POST(
      createRequest({ awardName: 'cannes', year: 2024 }),
    );

    expect(response.status).toBe(409);
    expect(mockAfter).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/awards/sync', () => {
  it('最新ジョブを返す', async () => {
    mockFindLatestJob.mockResolvedValue(RUNNING_JOB);
    mockIsJobStale.mockReturnValue(true);

    const response = await GET(
      new Request('http://localhost/api/admin/awards/sync'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.job.id).toBe('job-1');
    expect(body.data.isStale).toBe(true);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('ジョブが1件も無ければ null を返す', async () => {
    mockFindLatestJob.mockResolvedValue(null);

    const response = await GET(
      new Request('http://localhost/api/admin/awards/sync'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.job).toBeNull();
    expect(body.data.isStale).toBe(false);
  });

  it('ポーリングのレート制限超過で429を返す', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 30 });

    const response = await GET(
      new Request('http://localhost/api/admin/awards/sync'),
    );

    expect(response.status).toBe(429);
    expect(mockFindLatestJob).not.toHaveBeenCalled();
  });
});
