/**
 * @jest-environment node
 */

/**
 * OTP送信API Route テスト
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
  getAuthSession: jest.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

const mockCheckRateLimit = jest.fn().mockResolvedValue({ allowed: true });
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

jest.mock('@/lib/otp', () => ({
  generateOtpCode: () => '123456',
  sendOtpEmail: jest.fn().mockResolvedValue(true),
}));

// --- Helpers ---

const createRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/otp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/**
 * 前回送信なし + 既存OTP削除 + OTP INSERT成功 のモックを設定
 */
const setupOtpFlowMocks = () => {
  // 前回送信チェック（なし）
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              single: () => ({ data: null, error: { code: 'PGRST116' } }),
            }),
          }),
        }),
      }),
    }),
  });
  // 既存OTP削除
  mockFrom.mockReturnValueOnce({
    delete: () => ({
      eq: () => ({
        eq: () => ({ is: () => ({ data: null, error: null }) }),
      }),
    }),
  });
  // OTP挿入
  mockFrom.mockReturnValueOnce({
    insert: () => ({ error: null }),
  });
};

// --- Tests ---

describe('POST /api/auth/otp/send', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registration: 正常にOTPを送信できる', async () => {
    // ユーザー検索（未認証ユーザー）
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'user-1', is_verified: false },
            error: null,
          }),
        }),
      }),
    });
    setupOtpFlowMocks();

    const response = await POST(
      createRequest({ email: 'test@example.com', action: 'registration' }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('バリデーションエラーで400を返す', async () => {
    const response = await POST(
      createRequest({ email: 'invalid', action: 'unknown' }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('registration: 存在しないメールでも成功レスポンスを返す（メール列挙防止）', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({ data: null, error: { code: 'PGRST116' } }),
        }),
      }),
    });

    const response = await POST(
      createRequest({ email: 'nouser@example.com', action: 'registration' }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe('確認コードを送信しました。');
  });

  it('registration: 既に認証済みでも成功レスポンスを返す（メール列挙防止）', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'user-1', is_verified: true },
            error: null,
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({ email: 'verified@example.com', action: 'registration' }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe('確認コードを送信しました。');
  });

  it('再送間隔が短すぎる場合429を返す', async () => {
    // ユーザー検索
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'user-1', is_verified: false },
            error: null,
          }),
        }),
      }),
    });
    // 前回送信（直近）
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                single: () => ({
                  data: { created_at: new Date().toISOString() },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({ email: 'test@example.com', action: 'registration' }),
    );

    expect(response.status).toBe(429);
  });

  it('login: 存在しないメールでも成功レスポンスを返す（メール列挙防止）', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({ data: null, error: { code: 'PGRST116' } }),
        }),
      }),
    });

    const response = await POST(
      createRequest({ email: 'nouser@example.com', action: 'login' }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toBe('確認コードを送信しました。');
  });

  it('password_change: 未認証の場合401を返す', async () => {
    const { getAuthSession } = await import('@/helpers/auth');
    (getAuthSession as jest.Mock).mockResolvedValueOnce(null);

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        action: 'password_change',
      }),
    );

    expect(response.status).toBe(401);
  });

  it('password_change: 認証済みの場合正常にOTPを送信できる', async () => {
    setupOtpFlowMocks();

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        action: 'password_change',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('login: 正常にOTPを送信できる', async () => {
    // ユーザー検索
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({ data: { id: 'user-1' }, error: null }),
        }),
      }),
    });
    setupOtpFlowMocks();

    const response = await POST(
      createRequest({ email: 'test@example.com', action: 'login' }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('OTP挿入時のDBエラーで500を返す', async () => {
    // ユーザー検索
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'user-1', is_verified: false },
            error: null,
          }),
        }),
      }),
    });
    // 前回送信チェック（なし）
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                single: () => ({ data: null, error: { code: 'PGRST116' } }),
              }),
            }),
          }),
        }),
      }),
    });
    // 既存OTP削除
    mockFrom.mockReturnValueOnce({
      delete: () => ({
        eq: () => ({
          eq: () => ({ is: () => ({ data: null, error: null }) }),
        }),
      }),
    });
    // OTP挿入失敗
    mockFrom.mockReturnValueOnce({
      insert: () => ({ error: new Error('Insert failed') }),
    });

    const response = await POST(
      createRequest({ email: 'test@example.com', action: 'registration' }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('メール送信失敗で500を返す', async () => {
    // sendOtpEmailをfalseに変更
    const { sendOtpEmail } = await import('@/lib/otp');
    (sendOtpEmail as jest.Mock).mockResolvedValueOnce(false);

    // ユーザー検索
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({
            data: { id: 'user-1', is_verified: false },
            error: null,
          }),
        }),
      }),
    });
    setupOtpFlowMocks();

    const response = await POST(
      createRequest({ email: 'test@example.com', action: 'registration' }),
    );

    expect(response.status).toBe(500);
  });

  // === 日次送信上限 ===

  it('日次送信上限超過で429を返す', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 86400,
    });

    const response = await POST(
      createRequest({ email: 'test@example.com', action: 'login' }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('86400');
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(json.error.message).toBe(
      '本日の送信上限に達しました。明日再度お試しください。',
    );
  });

  it('日次送信上限チェックがemail単位でotp_send_dailyとして呼ばれる', async () => {
    // ユーザー検索
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          single: () => ({ data: { id: 'user-1' }, error: null }),
        }),
      }),
    });
    setupOtpFlowMocks();

    await POST(
      createRequest({ email: 'test@example.com', action: 'login' }),
    );

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'test@example.com',
      'otp_send_daily',
      5,
      1440,
    );
  });
});
