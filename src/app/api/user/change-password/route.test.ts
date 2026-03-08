/**
 * @jest-environment node
 */

/**
 * パスワード変更API Route テスト
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

jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  resetRateLimit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('new_hashed_password'),
}));

import bcrypt from 'bcryptjs';
import { getAuthSession } from '@/helpers/auth';
import { checkRateLimit } from '@/lib/rateLimit/rateLimit';

const mockBcryptCompare = bcrypt.compare as jest.Mock;

// --- Helpers ---

const createRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/user/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// --- Tests ---

describe('POST /api/user/change-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
    (checkRateLimit as jest.Mock).mockResolvedValue({ allowed: true });
  });

  it('正常にパスワードを変更できる', async () => {
    // ユーザー取得
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'user-123', password_hash: 'old_hash' },
            error: null,
          }),
        }),
      }),
    });
    // UPDATE成功
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({ error: null }),
      }),
    });

    mockBcryptCompare
      .mockResolvedValueOnce(true) // currentPassword is valid
      .mockResolvedValueOnce(false); // newPassword is different

    const response = await POST(
      createRequest({
        currentPassword: 'OldPassword1',
        newPassword: 'NewPassword1',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await POST(
      createRequest({
        currentPassword: 'OldPassword1',
        newPassword: 'NewPassword1',
      }),
    );

    expect(response.status).toBe(401);
  });

  it('レート制限超過で429を返す', async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      allowed: false,
      retryAfter: 1800,
    });

    const response = await POST(
      createRequest({
        currentPassword: 'OldPassword1',
        newPassword: 'NewPassword1',
      }),
    );

    expect(response.status).toBe(429);
  });

  it('バリデーションエラーで400を返す', async () => {
    const response = await POST(
      createRequest({
        currentPassword: '',
        newPassword: '123',
      }),
    );

    expect(response.status).toBe(400);
  });

  it('現在のパスワードが不正な場合400を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'user-123', password_hash: 'old_hash' },
            error: null,
          }),
        }),
      }),
    });

    mockBcryptCompare.mockResolvedValueOnce(false); // currentPassword is invalid

    const response = await POST(
      createRequest({
        currentPassword: 'WrongPassword1',
        newPassword: 'NewPassword1',
      }),
    );

    expect(response.status).toBe(400);
  });

  it('新旧パスワードが同一の場合400を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'user-123', password_hash: 'old_hash' },
            error: null,
          }),
        }),
      }),
    });

    mockBcryptCompare
      .mockResolvedValueOnce(true) // currentPassword is valid
      .mockResolvedValueOnce(true); // newPassword is same

    const response = await POST(
      createRequest({
        currentPassword: 'SamePassword1',
        newPassword: 'SamePassword1',
      }),
    );

    expect(response.status).toBe(400);
  });
});
