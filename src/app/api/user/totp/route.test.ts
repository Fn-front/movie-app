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
          single: () =>
            Promise.resolve({
              data: { username: null, password_hash: null },
            }),
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
      hasPassword: false,
      remainingRecoveryCodes: 7,
    });
  });

  /**
   * ⚠️ `method` は素通しであって `totp` 固定ではない（#1287）。
   *
   * 設定画面はこの値で「コードを送信する」ボタンを出すかを決める。
   * メールOTP の利用者にこのボタンが出ないと、無効化もリカバリーコード
   * 再発行もできなくなる（`send-challenge` のコメント参照）。
   */
  it('メールOTP の利用者には method=email_otp を返す', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.EMAIL_OTP);
    mockCountUnusedRecoveryCodes.mockResolvedValue(3);

    const response = await GET();
    const json = await response.json();

    expect(json.data).toEqual({
      enabled: true,
      method: SECOND_FACTOR_METHOD.EMAIL_OTP,
      emailOtpAvailable: true,
      hasPassword: false,
      remainingRecoveryCodes: 3,
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
      hasPassword: false,
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

  /**
   * 再認証でどちらの材料を求めるかの判定（#1372）
   *
   * ⚠️ 画面がセッション（JWT）の `hasPassword` で出し分けていたため、
   * 初回パスワードを設定した直後は最大5分ズレていた。サーバーの
   * `requireReauth` は `users.password_hash` の実値で決めるので、
   * **同じ列**をここから返して画面に使わせる。
   */
  describe('hasPassword（#1372）', () => {
    /** `users` の1行を返すモックを差し替える */
    const mockUserRow = (row: Record<string, unknown>) => {
      mockFrom.mockReturnValue({
        select: (columns: string) => {
          // 列を減らすと `password_hash` が undefined になり、
          // パスワードを持つ利用者が持たない扱いに落ちる
          expect(columns).toContain('password_hash');

          return {
            eq: () => ({ single: () => Promise.resolve({ data: row }) }),
          };
        },
      });
    };

    beforeEach(() => {
      mockGetSecondFactorMethod.mockResolvedValue(null);
    });

    it('password_hash があれば true を返す', async () => {
      mockUserRow({ username: null, password_hash: '$2a$12$hash' });

      const response = await GET();
      const json = await response.json();

      expect(json.data.hasPassword).toBe(true);
    });

    it('password_hash が NULL なら false を返す（OAuth のみ）', async () => {
      mockUserRow({ username: null, password_hash: null });

      const response = await GET();
      const json = await response.json();

      expect(json.data.hasPassword).toBe(false);
    });

    /**
     * ⛔ ハッシュそのものを渡さない。画面が要るのは有無だけで、
     * 値を返すと総当たりの的を手渡すことになる。
     */
    it('ハッシュそのものは応答に含めない', async () => {
      mockUserRow({ username: null, password_hash: '$2a$12$hash' });

      const response = await GET();
      const body = await response.text();

      expect(body).not.toContain('$2a$12$hash');
      expect(body).not.toContain('password_hash');
    });
  });
});
