/**
 * @jest-environment node
 */

/**
 * 視聴済み一括削除API Route テスト (POST)
 */

import { POST } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

jest.mock('@/helpers/auth', () => ({
  getAuthSession: jest.fn().mockResolvedValue({ user: { id: 'user-123' } }),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
}));

import { getAuthSession } from '@/helpers/auth';

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// --- Helpers ---

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

const createPostRequest = (body: unknown) =>
  new Request('http://localhost/api/watchlist/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** update / eq / is / not / gte / lt / select に渡された引数を記録する */
const calls: Record<string, unknown[][]> = {};

const mockBulkDelete = (
  data: Array<{ id: string }> | null,
  error: unknown = null,
) => {
  for (const key of Object.keys(calls)) delete calls[key];

  // jest.clearAllMocks() は mockReturnValueOnce のキューを消さない。
  // バリデーションで弾かれるケースは from を呼ばず未消費のまま残るため、
  // ここで積み直してテスト間の漏れを防ぐ
  mockFrom.mockReset();

  const record = (name: string) => {
    return (...args: unknown[]) => {
      calls[name] = [...(calls[name] ?? []), args];
      return chain;
    };
  };

  const chain: Record<string, unknown> = {
    eq: record('eq'),
    is: record('is'),
    not: record('not'),
    gte: record('gte'),
    lt: record('lt'),
    select: (...args: unknown[]) => {
      calls.select = [...(calls.select ?? []), args];
      return Promise.resolve({ data, error });
    },
  };

  mockFrom.mockReturnValueOnce({
    update: (...args: unknown[]) => {
      calls.update = [...(calls.update ?? []), args];
      return chain;
    },
  });
};

// --- Tests ---

describe('POST /api/watchlist/bulk-delete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('削除した件数を返す', async () => {
    mockBulkDelete([{ id: UUID_A }, { id: UUID_B }]);

    const response = await POST(createPostRequest({ year: 2024 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.deleted_count).toBe(2);
  });

  it('論理削除（deleted_at）で消す', async () => {
    mockBulkDelete([]);

    await POST(createPostRequest({ year: 2024 }));

    const updatePayload = calls.update?.[0]?.[0] as { deleted_at: string };
    expect(updatePayload.deleted_at).toEqual(expect.any(String));
  });

  it('自分のユーザーIDで絞り込む（他ユーザーの行を消さない）', async () => {
    mockBulkDelete([]);

    await POST(createPostRequest({ year: 2024 }));

    expect(calls.eq).toContainEqual(['user_id', 'user-123']);
  });

  it('視聴済み・未削除のみを対象にする', async () => {
    mockBulkDelete([]);

    await POST(createPostRequest({ year: 2024 }));

    expect(calls.is).toContainEqual(['deleted_at', null]);
    expect(calls.not).toContainEqual(['watched_at', 'is', null]);
  });

  it('JSTの年範囲で絞り込む（UTCの前年を取りこぼさない）', async () => {
    mockBulkDelete([]);

    await POST(createPostRequest({ year: 2025 }));

    expect(calls.gte).toContainEqual(['added_at', '2025-01-01T00:00:00+09:00']);
    expect(calls.lt).toContainEqual(['added_at', '2026-01-01T00:00:00+09:00']);
  });

  it('exclude_ids を除外条件に渡す', async () => {
    mockBulkDelete([]);

    await POST(
      createPostRequest({ year: 2024, exclude_ids: [UUID_A, UUID_B] }),
    );

    expect(calls.not).toContainEqual(['id', 'in', `(${UUID_A},${UUID_B})`]);
  });

  it('exclude_ids が空なら除外条件を付けない', async () => {
    mockBulkDelete([]);

    await POST(createPostRequest({ year: 2024, exclude_ids: [] }));

    // watched_at の1回だけで、id の除外は無い
    expect(calls.not).toEqual([['watched_at', 'is', null]]);
  });

  it('year が無いと400を返す', async () => {
    const response = await POST(createPostRequest({}));

    expect(response.status).toBe(400);
  });

  it('year が範囲外だと400を返す', async () => {
    const response = await POST(createPostRequest({ year: 1999 }));

    expect(response.status).toBe(400);
  });

  it('exclude_ids にUUIDでない値があると400を返す', async () => {
    const response = await POST(
      createPostRequest({ year: 2024, exclude_ids: ['not-a-uuid'] }),
    );

    expect(response.status).toBe(400);
  });

  it('exclude_ids が1001件だと400を返す', async () => {
    const ids = Array.from(
      { length: 1001 },
      (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    );

    const response = await POST(
      createPostRequest({ year: 2024, exclude_ids: ids }),
    );

    expect(response.status).toBe(400);
  });

  it('未認証なら401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await POST(createPostRequest({ year: 2024 }));

    expect(response.status).toBe(401);
  });

  it('レート制限を超えたら429を返す', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

    const response = await POST(createPostRequest({ year: 2024 }));

    expect(response.status).toBe(429);
  });

  it('更新が失敗したら500を返す', async () => {
    mockBulkDelete(null, { message: 'boom' });

    const response = await POST(createPostRequest({ year: 2024 }));

    expect(response.status).toBe(500);
  });

  describe('処理順', () => {
    // 認証 → レート制限 → バリデーション（#940）。
    // 識別子が session.user.id なので検証より前に確定している
    // （`.claude/rules/api-route.md`）
    it('バリデーションエラー時もレート制限を消費する', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: true });

      const response = await POST(createPostRequest({}));

      expect(response.status).toBe(400);
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    });

    it('レート制限超過時は、ボディが不正でも429を返す', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

      const response = await POST(createPostRequest({}));

      expect(response.status).toBe(429);
    });
  });
});
