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
const mockCheckSecondFactorRateLimit = jest.fn();
jest.mock('@/helpers/totpGuard', () => ({
  requireSecondFactor: (...args: unknown[]) => mockRequireSecondFactor(...args),
  checkSecondFactorRateLimit: (...args: unknown[]) =>
    mockCheckSecondFactorRateLimit(...args),
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
    mockCheckSecondFactorRateLimit.mockResolvedValue(null);
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

  describe('処理順', () => {
    // 認証 → レート制限 → バリデーション → 所持の証明（#940）。
    // レート制限の識別子は session.user.id なので検証より前に確定している。
    // 総当たりの入口であるこのルートで、形式を崩したコードを挟むだけで
    // カウンタを回避できる余地を残さない（`.claude/rules/api-route.md`）
    it('バリデーションエラー時もレート制限を消費する', async () => {
      const response = await POST(createRequest({ code: '' }));

      expect(response.status).toBe(400);
      expect(mockCheckSecondFactorRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
      );
    });

    it('レート制限超過時は、コードが不正でも429を返し検証もしない', async () => {
      mockCheckSecondFactorRateLimit.mockResolvedValue(
        new Response(JSON.stringify({ success: false }), { status: 429 }),
      );

      const response = await POST(createRequest({ code: '' }));

      expect(response.status).toBe(429);
      expect(mockRequireSecondFactor).not.toHaveBeenCalled();
    });
  });
});
