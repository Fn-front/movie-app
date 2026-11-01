/**
 * @jest-environment node
 */

const SESSION = { user: { id: 'admin-1' } };
let mockSupabase: unknown;
jest.mock('@/helpers/adminAuth', () => ({
  withAdminAuth:
    (handler: (ctx: unknown) => Promise<Response>) =>
    (
      request: Request,
      context?: { params?: Promise<Record<string, string>> },
    ) =>
      handler({
        session: SESSION,
        supabase: mockSupabase,
        request,
        params: context?.params,
      }),
}));

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...a: unknown[]) => mockCheckRateLimit(...a),
}));

const mockFindJobById = jest.fn();
const mockIsJobStale = jest.fn();
jest.mock('@/lib/awards/awardSyncJob', () => ({
  findJobById: (...a: unknown[]) => mockFindJobById(...a),
  isJobStale: (...a: unknown[]) => mockIsJobStale(...a),
}));

import { GET } from './route';

const VALID_ID = '11111111-1111-4111-8111-111111111111';

const call = (id: string) =>
  GET(new Request(`http://localhost/api/admin/awards/sync/${id}`), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockSupabase = { from: jest.fn() };
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockIsJobStale.mockReturnValue(false);
});

describe('GET /api/admin/awards/sync/[id]', () => {
  it('ジョブを返す', async () => {
    mockFindJobById.mockResolvedValue({ id: VALID_ID, status: 'succeeded' });

    const response = await call(VALID_ID);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.job.id).toBe(VALID_ID);
    expect(body.data.isStale).toBe(false);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('stale 判定を同梱する', async () => {
    mockFindJobById.mockResolvedValue({ id: VALID_ID, status: 'running' });
    mockIsJobStale.mockReturnValue(true);

    const body = await (await call(VALID_ID)).json();

    expect(body.data.isStale).toBe(true);
  });

  it('UUIDでないidを400で拒否する', async () => {
    const response = await call('not-a-uuid');

    expect(response.status).toBe(400);
    expect(mockFindJobById).not.toHaveBeenCalled();
  });

  it('存在しないidで404を返す', async () => {
    mockFindJobById.mockResolvedValue(null);

    const response = await call(VALID_ID);

    expect(response.status).toBe(404);
  });

  it('ポーリングのレート制限超過で429を返す', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 30 });

    const response = await call(VALID_ID);

    expect(response.status).toBe(429);
    expect(mockFindJobById).not.toHaveBeenCalled();
  });
});
