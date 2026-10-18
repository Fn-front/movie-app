/**
 * @jest-environment node
 */

/**
 * 二段階認証の無効化API Route テスト
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

const mockDisableTotp = jest.fn();
jest.mock('@/lib/auth/totpSetup', () => ({
  disableTotp: (...args: unknown[]) => mockDisableTotp(...args),
}));

// --- Helpers ---

const createRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/user/totp/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// --- Tests ---

describe('POST /api/user/totp/disable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockRequireSecondFactor.mockResolvedValue(null);
    mockDisableTotp.mockResolvedValue(undefined);
  });

  it('所持の証明が通れば無効化する', async () => {
    const response = await POST(createRequest({ code: '123456' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.message).toBe(TOTP_ERROR_MESSAGES.DISABLED);
    expect(mockDisableTotp).toHaveBeenCalledWith(expect.anything(), 'user-1');
  });

  it('リカバリーコードでも無効化できる', async () => {
    await POST(createRequest({ code: 'ABCDE-FGHJK' }));

    expect(mockRequireSecondFactor).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'ABCDE-FGHJK',
    );
  });

  it('所持の証明が通らなければ無効化しない', async () => {
    // セッションだけで外せたら、セッションを奪った第三者がそのまま
    // 第2要素を無効化できてしまう
    mockRequireSecondFactor.mockResolvedValue(
      new Response(JSON.stringify({ success: false }), { status: 400 }),
    );

    const response = await POST(createRequest({ code: '000000' }));

    expect(response.status).toBe(400);
    expect(mockDisableTotp).not.toHaveBeenCalled();
  });

  it.each([
    ['コード未指定', {}],
    ['空文字', { code: '' }],
    ['空白のみ', { code: '   ' }],
    ['長すぎる', { code: 'a'.repeat(33) }],
  ])('%s は400を返し検証もしない', async (_label, body) => {
    const response = await POST(createRequest(body));

    expect(response.status).toBe(400);
    expect(mockRequireSecondFactor).not.toHaveBeenCalled();
  });

  it('未認証なら401を返す', async () => {
    mockGetAuthSession.mockResolvedValue(null);

    const response = await POST(createRequest({ code: '123456' }));

    expect(response.status).toBe(401);
    expect(mockDisableTotp).not.toHaveBeenCalled();
  });

  it('例外時は500を返す', async () => {
    mockDisableTotp.mockRejectedValue(new Error('db error'));

    const response = await POST(createRequest({ code: '123456' }));

    expect(response.status).toBe(500);
  });
});
