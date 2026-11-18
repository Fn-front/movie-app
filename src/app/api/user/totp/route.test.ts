/**
 * @jest-environment node
 */

/**
 * 二段階認証の状態取得API Route テスト
 */

import { SECOND_FACTOR_METHOD } from '@/constants/secondFactor';

import { GET } from './route';

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

const mockGetSecondFactorMethod = jest.fn();
const mockCountUnusedRecoveryCodes = jest.fn();
jest.mock('@/lib/auth/secondFactor', () => ({
  getSecondFactorMethod: (...args: unknown[]) =>
    mockGetSecondFactorMethod(...args),
  countUnusedRecoveryCodes: (...args: unknown[]) =>
    mockCountUnusedRecoveryCodes(...args),
}));

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// --- Tests ---

describe('GET /api/user/totp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    // admin 発行アカウントかどうかの判定に users.username を引く
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { username: null } }),
        }),
      }),
    });
  });

  it('有効なユーザーの状態と残数を返す', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);
    mockCountUnusedRecoveryCodes.mockResolvedValue(7);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toEqual({
      enabled: true,
      method: SECOND_FACTOR_METHOD.TOTP,
      emailOtpAvailable: true,
      remainingRecoveryCodes: 7,
    });
  });

  it('無効なユーザーには残数を問い合わせない', async () => {
    // 無効なら残数に意味がない
    mockGetSecondFactorMethod.mockResolvedValue(null);

    const response = await GET();
    const json = await response.json();

    expect(json.data).toEqual({
      enabled: false,
      method: null,
      emailOtpAvailable: true,
      remainingRecoveryCodes: 0,
    });
    expect(mockCountUnusedRecoveryCodes).not.toHaveBeenCalled();
  });

  it('未認証なら401を返す', async () => {
    mockGetAuthSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockGetSecondFactorMethod).not.toHaveBeenCalled();
  });

  it('例外時は500を返す', async () => {
    mockGetSecondFactorMethod.mockRejectedValue(new Error('db error'));

    const response = await GET();

    expect(response.status).toBe(500);
  });

  describe('レート制限（#934）', () => {
    it('読み取り用の read_api_user_data として数える', async () => {
      mockGetSecondFactorMethod.mockResolvedValue(null);

      await GET();

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        'read_api_user_data',
        200,
        1,
      );
    });

    it('上限超過で429を返し、DBを読まない', async () => {
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        retryAfter: 600,
      });

      const response = await GET();

      expect(response.status).toBe(429);
      expect(mockGetSecondFactorMethod).not.toHaveBeenCalled();
    });
  });
  /**
   * ⚠️ admin が発行したアカウントは `users.email` が
   * `generateSyntheticEmail()` の `.invalid` TLD（RFC 2606、絶対に
   * 名前解決されない）。メールOTP を選ばせるとコードが永久に届かない。
   */
  it('admin 発行アカウント（username あり）はメールOTP を選べない', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(null);
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { username: 'alice' } }),
        }),
      }),
    });

    const response = await GET();
    const json = await response.json();

    expect(json.data.emailOtpAvailable).toBe(false);
  });
});
