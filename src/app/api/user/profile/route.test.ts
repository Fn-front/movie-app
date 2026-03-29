/**
 * @jest-environment node
 */

/**
 * 表示名更新API テスト (PUT)
 */

import { PROFILE_ERROR_MESSAGES, PROFILE_SUCCESS_MESSAGES } from '@/constants';

import { PUT } from './route';

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

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

import { getAuthSession } from '@/helpers/auth';

// --- Helpers ---

const createPutRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/user/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// --- Tests ---

describe('PUT /api/user/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
  });

  it('表示名を更新できる', async () => {
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({ error: null }),
      }),
    });

    const response = await PUT(createPutRequest({ name: 'テストユーザー' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe(PROFILE_SUCCESS_MESSAGES.UPDATED);
  });

  it('空文字でバリデーションエラー400を返す', async () => {
    const response = await PUT(createPutRequest({ name: '' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('空白のみでバリデーションエラー400を返す', async () => {
    const response = await PUT(createPutRequest({ name: '   ' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('101文字以上でバリデーションエラー400を返す', async () => {
    const response = await PUT(createPutRequest({ name: 'a'.repeat(101) }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('100文字は更新できる', async () => {
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({ error: null }),
      }),
    });

    const response = await PUT(createPutRequest({ name: 'a'.repeat(100) }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await PUT(createPutRequest({ name: 'テスト' }));

    expect(response.status).toBe(401);
  });

  it('DBエラー時に500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({ error: new Error('Update failed') }),
      }),
    });

    const response = await PUT(createPutRequest({ name: 'テスト' }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error.message).toBe(PROFILE_ERROR_MESSAGES.UPDATE_FAILED);
  });

  it('レート制限超過時に429を返す', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 60,
    });

    const response = await PUT(createPutRequest({ name: 'テスト' }));
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(json.error.details.retryAfter).toBe(60);
  });
});
