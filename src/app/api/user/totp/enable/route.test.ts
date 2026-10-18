/**
 * @jest-environment node
 */

/**
 * 二段階認証の有効化API Route テスト
 */

import { TOTP_ERROR_MESSAGES } from '@/constants/totp';

import { POST } from './route';

// --- Mocks ---

jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: jest.fn() }),
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
const mockResetRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  resetRateLimit: (...args: unknown[]) => mockResetRateLimit(...args),
}));

const mockConfirmTotpSetup = jest.fn();
jest.mock('@/lib/auth/totpSetup', () => ({
  confirmTotpSetup: (...args: unknown[]) => mockConfirmTotpSetup(...args),
}));

// --- Helpers ---

const createRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/user/totp/enable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// --- Tests ---

describe('POST /api/user/totp/enable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockConfirmTotpSetup.mockResolvedValue(['ABCDE-FGHJK', 'MNPQR-STWXY']);
  });

  it('正しいコードで有効化しリカバリーコードを返す', async () => {
    const response = await POST(createRequest({ code: '123456' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.message).toBe(TOTP_ERROR_MESSAGES.ENABLED);
    expect(json.data.recoveryCodes).toEqual(['ABCDE-FGHJK', 'MNPQR-STWXY']);
  });

  it('成功時にレート制限をリセットする', async () => {
    await POST(createRequest({ code: '123456' }));

    expect(mockResetRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'totp_verify',
    );
  });

  it('誤ったコードなら400を返す', async () => {
    mockConfirmTotpSetup.mockResolvedValue(null);

    const response = await POST(createRequest({ code: '000000' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.message).toBe(TOTP_ERROR_MESSAGES.INVALID_CODE);
  });

  it.each([
    ['コード未指定', {}],
    ['桁数が足りない', { code: '12345' }],
    ['桁数が多い', { code: '1234567' }],
    ['数字以外', { code: 'abcdef' }],
    ['リカバリーコード形式', { code: 'ABCDE-FGHJK' }],
  ])('%s は400を返す', async (_label, body) => {
    // 有効化は認証アプリのコードに限る。リカバリーコードはまだ発行されていない
    const response = await POST(createRequest(body));

    expect(response.status).toBe(400);
    expect(mockConfirmTotpSetup).not.toHaveBeenCalled();
  });

  it('未認証なら401を返す', async () => {
    mockGetAuthSession.mockResolvedValue(null);

    const response = await POST(createRequest({ code: '123456' }));

    expect(response.status).toBe(401);
  });

  it('試行上限を超えたら検証せず429を返す', async () => {
    // 6桁 = 100万通り。上限が無いと総当たりで有効化できてしまう
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 900 });

    const response = await POST(createRequest({ code: '123456' }));

    expect(response.status).toBe(429);
    expect(mockConfirmTotpSetup).not.toHaveBeenCalled();
  });

  it('例外時は500を返す', async () => {
    mockConfirmTotpSetup.mockRejectedValue(new Error('db error'));

    const response = await POST(createRequest({ code: '123456' }));

    expect(response.status).toBe(500);
  });
});
