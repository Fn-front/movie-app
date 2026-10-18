/**
 * @jest-environment node
 */

/**
 * リカバリーコード再発行API Route テスト
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

const mockRequireSecondFactor = jest.fn();
jest.mock('@/helpers/totpGuard', () => ({
  requireSecondFactor: (...args: unknown[]) => mockRequireSecondFactor(...args),
}));

const mockRegenerate = jest.fn();
jest.mock('@/lib/auth/totpSetup', () => ({
  regenerateRecoveryCodes: (...args: unknown[]) => mockRegenerate(...args),
}));

// --- Helpers ---

const createRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/user/totp/recovery-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// --- Tests ---

describe('POST /api/user/totp/recovery-codes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockRequireSecondFactor.mockResolvedValue(null);
    mockRegenerate.mockResolvedValue(['ABCDE-FGHJK']);
  });

  it('所持の証明が通れば再発行して返す', async () => {
    const response = await POST(createRequest({ code: '123456' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.message).toBe(TOTP_ERROR_MESSAGES.RECOVERY_CODES_REGENERATED);
    expect(json.data.recoveryCodes).toEqual(['ABCDE-FGHJK']);
  });

  it('所持の証明が通らなければ再発行しない', async () => {
    // 第三者に実行されると、以前のコードが無効になり復旧手段を奪われる
    mockRequireSecondFactor.mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 400 }),
    );

    const response = await POST(createRequest({ code: '000000' }));

    expect(response.status).toBe(400);
    expect(mockRegenerate).not.toHaveBeenCalled();
  });

  it('コード未指定なら400を返し検証もしない', async () => {
    const response = await POST(createRequest({}));

    expect(response.status).toBe(400);
    expect(mockRequireSecondFactor).not.toHaveBeenCalled();
  });

  it('未認証なら401を返す', async () => {
    mockGetAuthSession.mockResolvedValue(null);

    const response = await POST(createRequest({ code: '123456' }));

    expect(response.status).toBe(401);
    expect(mockRegenerate).not.toHaveBeenCalled();
  });

  it('例外時は500を返す', async () => {
    mockRegenerate.mockRejectedValue(new Error('db error'));

    const response = await POST(createRequest({ code: '123456' }));

    expect(response.status).toBe(500);
  });
});
