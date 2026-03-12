/**
 * @jest-environment node
 */

/**
 * OTP検証API Route テスト
 */

import { POST } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

// --- Helpers ---

const createRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const futureDate = new Date(Date.now() + 10 * 60 * 1000).toISOString();
const pastDate = new Date(Date.now() - 10 * 60 * 1000).toISOString();

// --- Tests ---

describe('POST /api/auth/otp/verify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registration: 正常にOTPを検証して認証完了できる', async () => {
    // OTPレコード取得
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: {
                      id: 'otp-1',
                      email: 'test@example.com',
                      code: '123456',
                      action_type: 'registration',
                      attempts: 0,
                      expires_at: futureDate,
                      verified_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });
    // usersテーブル更新
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({ data: null, error: null }),
      }),
    });
    // OTPレコード削除
    mockFrom.mockReturnValueOnce({
      delete: () => ({
        eq: () => ({ data: null, error: null }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '123456',
        action: 'registration',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toContain('メール認証');
  });

  it('login: 正常にOTPを検証して検証済みフラグを設定できる', async () => {
    // OTPレコード取得
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: {
                      id: 'otp-1',
                      email: 'test@example.com',
                      code: '123456',
                      action_type: 'login',
                      attempts: 0,
                      expires_at: futureDate,
                      verified_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });
    // OTPレコード更新
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({ data: null, error: null }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '123456',
        action: 'login',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('バリデーションエラーで400を返す', async () => {
    const response = await POST(
      createRequest({
        email: 'invalid',
        code: '12',
        action: 'unknown',
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
  });

  it('OTPレコードが見つからない場合400を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: null,
                    error: { code: 'PGRST116' },
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '123456',
        action: 'registration',
      }),
    );

    expect(response.status).toBe(400);
  });

  it('有効期限切れの場合400を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: {
                      id: 'otp-1',
                      code: '123456',
                      attempts: 0,
                      expires_at: pastDate,
                      verified_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '123456',
        action: 'registration',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.message).toContain('有効期限');
  });

  it('試行回数超過の場合429を返す', async () => {
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: {
                      id: 'otp-1',
                      code: '123456',
                      attempts: 5,
                      expires_at: futureDate,
                      verified_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '123456',
        action: 'registration',
      }),
    );

    expect(response.status).toBe(429);
  });

  it('コードが不一致の場合400を返し残り試行回数を含む', async () => {
    // OTPレコード取得
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: {
                      id: 'otp-1',
                      code: '123456',
                      attempts: 2,
                      expires_at: futureDate,
                      verified_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });
    // attempts更新
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({ data: null, error: null }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '999999',
        action: 'registration',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.details.remainingAttempts).toBe(2);
  });

  it('password_change: 正常にOTPを検証して検証済みフラグを設定できる', async () => {
    // OTPレコード取得
    mockFrom.mockReturnValueOnce({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({
                limit: () => ({
                  single: () => ({
                    data: {
                      id: 'otp-1',
                      email: 'test@example.com',
                      code: '123456',
                      action_type: 'password_change',
                      attempts: 0,
                      expires_at: futureDate,
                      verified_at: null,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    });
    // OTPレコード更新
    mockFrom.mockReturnValueOnce({
      update: () => ({
        eq: () => ({ data: null, error: null }),
      }),
    });

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        code: '123456',
        action: 'password_change',
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
  });
});
