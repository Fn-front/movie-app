/**
 * @jest-environment node
 */

/**
 * 二段階認証の設定に使う再認証コードの送信（#1368）
 *
 * ⚠️ 固定したいのは**宛先を外から指定させないこと**と、
 * **要らない利用者に送らないこと**。
 */

import { SECOND_FACTOR_SETUP_CODE_MESSAGES } from '@/constants/secondFactorSetupCode';

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

const mockSendUserBoundOtp = jest.fn();
jest.mock('@/lib/auth/userBoundOtp', () => ({
  ...jest.requireActual('@/lib/auth/userBoundOtp'),
  sendUserBoundOtp: (...args: unknown[]) => mockSendUserBoundOtp(...args),
}));

// --- Helpers ---

const mockUserQuery = (
  user: {
    email: string;
    username: string | null;
    password_hash: string | null;
  } | null,
  error: unknown = null,
) => {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: error ? null : user, error }),
      }),
    }),
  });
};

// --- Tests ---

describe('POST /api/user/totp/reauth-code', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReset();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockSendUserBoundOtp.mockResolvedValue('sent');
    mockUserQuery({
      email: 'owner@example.com',
      username: null,
      password_hash: null,
    });
  });

  describe('認証', () => {
    it('未認証で401を返し、送信しない', async () => {
      mockGetAuthSession.mockResolvedValue(null);

      const response = await POST();

      expect(response.status).toBe(401);
      expect(mockSendUserBoundOtp).not.toHaveBeenCalled();
    });
  });

  describe('レート制限', () => {
    it('上限超過で429を返し、送信しない', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 600 });

      const response = await POST();

      expect(response.status).toBe(429);
      expect(mockSendUserBoundOtp).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ **`TOTP_SETTINGS_VERIFY`（設定変更の試行）とは別カウンタ。**
     *
     * 同じにすると、コードを送り直すだけで設定の試行枠を食い尽くし、
     * **正しいコードを持っていても設定できなくなる**。
     */
    it('設定の試行枠とは別のカウンタで数える', async () => {
      await POST();

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        'second_factor_setup_code_send',
        expect.any(Number),
        expect.any(Number),
      );
      expect(mockCheckRateLimit).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'totp_settings_verify',
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('宛先', () => {
    /**
     * ⛔ **ボディを読まない。** 宛先を受け付けると、アカウントを1つ持つだけで
     * 任意のアドレスへ自サービス名義のコードを送れる（#641）。
     */
    it('users から引いたアドレスへ、設定用の用途で送る', async () => {
      await POST();

      expect(mockSendUserBoundOtp).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        'owner@example.com',
        'second_factor_setup',
      );
    });

    /**
     * ⚠️ **コードが要らない利用者には送らない。** パスワードを持つ利用者は
     * `setup` でパスワードを要求されるので、このコードを使う場面が無い。
     * 送ると無駄なメールが届き、第三者が被害者の受信箱へ送り込める。
     */
    it('パスワードを持つ利用者には送らない', async () => {
      mockUserQuery({
        email: 'owner@example.com',
        username: null,
        password_hash: 'hashed',
      });

      const response = await POST();
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toBe(
        SECOND_FACTOR_SETUP_CODE_MESSAGES.CODE_NOT_REQUIRED,
      );
      expect(mockSendUserBoundOtp).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ admin が発行したアカウントは `users.email` が `.invalid` TLD
     * （RFC 2606、絶対に名前解決されない）なので永久に届かない。
     */
    it('コードが届かないアカウントには送らず、窓口へ誘導する', async () => {
      mockUserQuery({
        email: 'abc@def.invalid',
        username: 'K7M2QXPT9WFN',
        password_hash: null,
      });

      const response = await POST();
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toBe(
        SECOND_FACTOR_SETUP_CODE_MESSAGES.EMAIL_UNAVAILABLE,
      );
      expect(mockSendUserBoundOtp).not.toHaveBeenCalled();
    });

    it('行が無ければ404を返し、送信しない', async () => {
      mockUserQuery(null);

      const response = await POST();

      expect(response.status).toBe(404);
      expect(mockSendUserBoundOtp).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ **読み取りの失敗を 404 に丸めない**（#1368 のレビュー）。
     *
     * 404 の文言は「このアカウントには確認コードをお送りできません。
     * お手数ですが窓口までご連絡ください。」で、待てば直る障害の利用者を
     * サポート窓口へ送ってしまう。同じ `users` の読み取りについて
     * `totp/setup` も 500 に倒している。
     */
    it('読み取りに失敗したら500を返す（404に丸めない）', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockUserQuery(null, { code: '57P01', message: 'connection lost' });

      const response = await POST();

      expect(response.status).toBe(500);
      expect(mockSendUserBoundOtp).not.toHaveBeenCalled();

      spy.mockRestore();
    });
  });

  describe('送信の結果', () => {
    it('送れたら200を返す', async () => {
      const response = await POST();
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.message).toBe(SECOND_FACTOR_SETUP_CODE_MESSAGES.CODE_SENT);
    });

    // 二度押しでメールボックスへ連投しない
    it('再送間隔の内側なら429を返す', async () => {
      mockSendUserBoundOtp.mockResolvedValue('throttled');

      expect((await POST()).status).toBe(429);
    });

    it('送信に失敗したら500を返す', async () => {
      mockSendUserBoundOtp.mockResolvedValue('send_failed');

      expect((await POST()).status).toBe(500);
    });

    it('例外は500に丸める', async () => {
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockSendUserBoundOtp.mockRejectedValue(new Error('db down'));

      expect((await POST()).status).toBe(500);

      spy.mockRestore();
    });
  });
});
