/**
 * @jest-environment node
 */

/**
 * パスワード変更API Route テスト（OTP検証ベース）
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

/** ユーザー取得のモック */
const mockUserSelect = (userData: Record<string, unknown> | null) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        single: () => ({
          data: userData,
          error: userData ? null : { message: 'not found' },
        }),
      }),
    }),
  });
};

/** OTP取得のモック */
const mockOtpSelect = (otpData: Record<string, unknown> | null) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          not: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                single: () => ({
                  data: otpData,
                  error: otpData ? null : { message: 'not found' },
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  });
};

/** UPDATE成功のモック */
const mockUpdateSuccess = () => {
  mockFrom.mockReturnValueOnce({
    update: () => ({
      eq: () => ({ error: null }),
    }),
  });
};

/** OTP削除のモック */
const mockOtpDelete = () => {
  mockFrom.mockReturnValueOnce({
    delete: () => ({
      eq: () => ({ error: null }),
    }),
  });
};

// --- Tests ---

describe('POST /api/user/change-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getAuthSession as jest.Mock).mockResolvedValue({
      user: { id: 'user-123' },
    });
    (checkRateLimit as jest.Mock).mockResolvedValue({ allowed: true });
  });

  it('OTP検証済みで正常にパスワードを変更できる', async () => {
    mockUserSelect({
      id: 'user-123',
      email: 'test@example.com',
      password_hash: 'old_hash',
    });
    mockOtpSelect({
      id: 'otp-1',
      verified_at: new Date().toISOString(),
    });
    mockBcryptCompare.mockResolvedValueOnce(false); // newPassword is different
    mockOtpDelete(); // OTP削除（パスワード更新前に無効化）
    mockUpdateSuccess();

    const response = await POST(createRequest({ newPassword: 'NewPassword1' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('未認証で401を返す', async () => {
    (getAuthSession as jest.Mock).mockResolvedValue(null);

    const response = await POST(createRequest({ newPassword: 'NewPassword1' }));

    expect(response.status).toBe(401);
  });

  it('レート制限超過で429を返す', async () => {
    (checkRateLimit as jest.Mock).mockResolvedValue({
      allowed: false,
      retryAfter: 1800,
    });

    const response = await POST(createRequest({ newPassword: 'NewPassword1' }));

    expect(response.status).toBe(429);
  });

  it('バリデーションエラーで400を返す', async () => {
    const response = await POST(createRequest({ newPassword: '123' }));

    expect(response.status).toBe(400);
  });

  it('OTP検証が未完了の場合400を返す', async () => {
    mockUserSelect({
      id: 'user-123',
      email: 'test@example.com',
      password_hash: 'old_hash',
    });
    mockOtpSelect(null); // 検証済みOTPなし

    const response = await POST(createRequest({ newPassword: 'NewPassword1' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.message).toBe('OTP検証が完了していません。');
  });

  it('検証済みOTPが期限切れの場合400を返す', async () => {
    mockUserSelect({
      id: 'user-123',
      email: 'test@example.com',
      password_hash: 'old_hash',
    });
    // 10分前のverified_at（5分の制限を超過）
    mockOtpSelect({
      id: 'otp-1',
      verified_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });
    mockOtpDelete(); // 期限切れOTP削除

    const response = await POST(createRequest({ newPassword: 'NewPassword1' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.message).toBe(
      '確認コードの有効期限が切れました。再送信してください。',
    );
  });

  it('新旧パスワードが同一の場合400を返す', async () => {
    mockUserSelect({
      id: 'user-123',
      email: 'test@example.com',
      password_hash: 'old_hash',
    });
    mockOtpSelect({
      id: 'otp-1',
      verified_at: new Date().toISOString(),
    });
    mockBcryptCompare.mockResolvedValueOnce(true); // newPassword is same

    const response = await POST(
      createRequest({ newPassword: 'SamePassword1' }),
    );

    expect(response.status).toBe(400);
  });

  it('パスワード未設定ユーザーでもOTP検証済みなら変更できる', async () => {
    mockUserSelect({
      id: 'user-123',
      email: 'test@example.com',
      password_hash: null,
    });
    mockOtpSelect({
      id: 'otp-1',
      verified_at: new Date().toISOString(),
    });
    // password_hash が null なので同一チェックはスキップされる
    mockOtpDelete(); // OTP削除（パスワード更新前に無効化）
    mockUpdateSuccess();

    const response = await POST(createRequest({ newPassword: 'NewPassword1' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });
});
