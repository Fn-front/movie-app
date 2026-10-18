/**
 * @jest-environment node
 */

/**
 * 二段階認証の設定開始API Route テスト
 */

import { TOTP_ERROR_MESSAGES } from '@/constants/totp';

import { POST } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
  dbConnectionErrorResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 500 }),
}));

const mockGetAuthSession = jest.fn();
jest.mock('@/helpers/auth', () => ({
  getAuthSession: () => mockGetAuthSession(),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ success: false }), { status: 401 }),
}));

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockStartTotpSetup = jest.fn();
jest.mock('@/lib/auth/totpSetup', () => ({
  startTotpSetup: (...args: unknown[]) => mockStartTotpSetup(...args),
}));

// --- Helpers ---

/** users の取得をモックする */
const mockUserLookup = (email: string | null) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: email ? { email } : null }),
      }),
    }),
  });
};

// --- Tests ---

describe('POST /api/user/totp/setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReset();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockStartTotpSetup.mockResolvedValue({
      otpauthUri: 'otpauth://totp/Movie%20App:user@example.com?secret=ABC',
      secret: 'ABCDEFGHIJKLMNOP',
    });
  });

  it('QRコードと手入力用の鍵を返す', async () => {
    mockUserLookup('user@example.com');

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.secret).toBe('ABCDEFGHIJKLMNOP');
    expect(json.data.qrCodeDataUri).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('QRは data URI で返す（SVG文字列をそのまま渡さない）', async () => {
    // 文字列のまま渡すと受け取り側で dangerouslySetInnerHTML が必要になり、
    // XSSのsinkを1つ増やすことになる
    mockUserLookup('user@example.com');

    const response = await POST();
    const json = await response.json();

    expect(json.data).not.toHaveProperty('qrCodeSvg');
    // デコードすると SVG になっている
    const svg = Buffer.from(
      json.data.qrCodeDataUri.split('base64,')[1],
      'base64',
    ).toString('utf8');
    expect(svg).toMatch(/^<svg/);
  });

  it('認証アプリの表示名にはDBのメールアドレスを使う', async () => {
    mockUserLookup('user@example.com');

    await POST();

    expect(mockStartTotpSetup).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'user@example.com',
    );
  });

  it('未認証なら401を返す', async () => {
    mockGetAuthSession.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(401);
    expect(mockStartTotpSetup).not.toHaveBeenCalled();
  });

  it('ユーザーが見つからなければ401を返す', async () => {
    mockUserLookup(null);

    const response = await POST();

    expect(response.status).toBe(401);
  });

  it('既に有効化済みなら400を返す', async () => {
    mockUserLookup('user@example.com');
    mockStartTotpSetup.mockRejectedValue(new Error('TOTP is already enabled'));

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.message).toBe(TOTP_ERROR_MESSAGES.ALREADY_ENABLED);
  });

  it('試行上限を超えたら429を返す', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 900 });

    const response = await POST();

    expect(response.status).toBe(429);
    expect(mockStartTotpSetup).not.toHaveBeenCalled();
  });
});
