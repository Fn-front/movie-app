/**
 * @jest-environment node
 */

/**
 * 新規登録API Route テスト
 */

import { POST } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
}));

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockGenerateOtpCode = jest.fn().mockReturnValue('123456');
const mockSendOtpEmail = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/otp', () => ({
  generateOtpCode: () => mockGenerateOtpCode(),
  sendOtpEmail: (...args: unknown[]) => mockSendOtpEmail(...args),
}));

// --- Helpers ---

const createRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/**
 * 既存ユーザーなし + INSERT成功 + OTP INSERT成功 のモックを設定
 */
const setupSuccessMocks = () => {
  // 既存ユーザーなし
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({ single: () => ({ data: null, error: null }) }),
    }),
  });
  // ユーザーINSERT成功
  mockFrom.mockReturnValueOnce({
    insert: () => ({
      select: () => ({
        single: () => ({
          data: { id: 'user-123' },
          error: null,
        }),
      }),
    }),
  });
  // OTP INSERT成功
  mockFrom.mockReturnValueOnce({
    insert: () => ({ error: null }),
  });
};

// --- Tests ---

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('正常に登録でき、OTPメールが送信される', async () => {
    setupSuccessMocks();

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        password: 'Password1',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.userId).toBe('user-123');
    expect(mockGenerateOtpCode).toHaveBeenCalled();
    expect(mockSendOtpEmail).toHaveBeenCalledWith('test@example.com', '123456');
  });

  it('バリデーションエラーで400を返す', async () => {
    const response = await POST(
      createRequest({
        email: 'invalid',
        password: '123',
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('既存ユーザーで409を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({ data: { id: 'existing' }, error: null }),
        }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'existing@example.com',
        password: 'Password1',
      }),
    );

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('ユーザーINSERT失敗で500を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({ single: () => ({ data: null, error: null }) }),
      }),
    });
    mockFrom.mockReturnValueOnce({
      insert: () => ({
        select: () => ({
          single: () => ({
            data: null,
            error: new Error('DB error'),
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        password: 'Password1',
      }),
    );

    expect(response.status).toBe(500);
  });

  it('OTPメール送信失敗で500を返し、ユーザー・OTPレコードを削除する', async () => {
    // 既存ユーザーなし
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({ single: () => ({ data: null, error: null }) }),
      }),
    });
    // ユーザーINSERT成功
    mockFrom.mockReturnValueOnce({
      insert: () => ({
        select: () => ({
          single: () => ({
            data: { id: 'user-123' },
            error: null,
          }),
        }),
      }),
    });
    // OTP INSERT成功
    mockFrom.mockReturnValueOnce({
      insert: () => ({ error: null }),
    });

    mockSendOtpEmail.mockResolvedValueOnce(false);

    // ロールバック: OTPレコード削除
    const mockOtpDelete = jest.fn().mockReturnValue({ eq: jest.fn() });
    mockFrom.mockReturnValueOnce({ delete: mockOtpDelete });
    // ロールバック: ユーザーレコード削除
    const mockUserDelete = jest.fn().mockReturnValue({ eq: jest.fn() });
    mockFrom.mockReturnValueOnce({ delete: mockUserDelete });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        password: 'Password1',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    // ロールバックが実行されたことを確認
    expect(mockOtpDelete).toHaveBeenCalled();
    expect(mockUserDelete).toHaveBeenCalled();
  });

  it('レート制限超過で429を返す', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 3600,
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        password: 'Password1',
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('3600');
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('OTP INSERT失敗で500を返す', async () => {
    // 既存ユーザーなし
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({ single: () => ({ data: null, error: null }) }),
      }),
    });
    // ユーザーINSERT成功
    mockFrom.mockReturnValueOnce({
      insert: () => ({
        select: () => ({
          single: () => ({
            data: { id: 'user-123' },
            error: null,
          }),
        }),
      }),
    });
    // OTP INSERT失敗
    mockFrom.mockReturnValueOnce({
      insert: () => ({ error: new Error('OTP insert error') }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        password: 'Password1',
      }),
    );

    expect(response.status).toBe(500);
  });
});
