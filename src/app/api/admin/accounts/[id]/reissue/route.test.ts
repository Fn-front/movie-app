/**
 * @jest-environment node
 */

/**
 * パスワード設定リンク再発行 API Route テスト
 *
 * #1223（送信失敗で相手の有効なリンクだけが死ぬ）で新設した。
 * それまでテストファイルが無く、`.claude/rules/api-route.md` に
 * 「未検証」として残っていたハンドラ。
 */

import { POST } from './route';
import { ADMIN_ACCOUNT_MESSAGES } from '@/constants/adminAccount';

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

const mockFindReissuableAccount = jest.fn();
const mockRecordReissueAudit = jest.fn();
jest.mock('@/lib/auth/adminAccount', () => ({
  findReissuableAccount: (...args: unknown[]) =>
    mockFindReissuableAccount(...args),
  recordReissueAudit: (...args: unknown[]) => mockRecordReissueAudit(...args),
}));

const mockIssuePasswordResetToken = jest.fn();
const mockInvalidateOtherTokens = jest.fn();
jest.mock('@/lib/auth/passwordResetToken', () => ({
  issuePasswordResetToken: (...args: unknown[]) =>
    mockIssuePasswordResetToken(...args),
  invalidateOtherPasswordResetTokens: (...args: unknown[]) =>
    mockInvalidateOtherTokens(...args),
}));

const mockSendAdminAccountEmail = jest.fn();
jest.mock('@/lib/auth/sendAdminAccountEmail', () => ({
  sendAdminAccountEmail: (...args: unknown[]) =>
    mockSendAdminAccountEmail(...args),
}));

jest.mock('@/lib/auth/accountSetupUrl', () => ({
  buildAccountSetupUrl: (token: string) =>
    `http://localhost/account/setup?token=${token}`,
}));

// --- Helpers ---

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

const createRequest = (body: Record<string, unknown> = {}) =>
  new Request(`http://localhost/api/admin/accounts/${ACCOUNT_ID}/reissue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'someone@example.com', ...body }),
  });

const createContext = (id: string = ACCOUNT_ID) => ({
  params: Promise.resolve({ id }),
});

/** withAdminAuth はロールをDBから読む（JWT を信用しない） */
const mockAdminRoleLookup = (role: string | null) => {
  mockFrom.mockReturnValueOnce({
    select: () => ({
      eq: () => ({
        maybeSingle: () => ({ data: role ? { role } : null, error: null }),
      }),
    }),
  });
};

// --- Tests ---

describe('POST /api/admin/accounts/[id]/reissue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks は mockReturnValueOnce のキューを消さない
    mockFrom.mockReset();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'admin-1' } });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockFindReissuableAccount.mockResolvedValue('issued-1');
    mockIssuePasswordResetToken.mockResolvedValue('plain-token');
    mockInvalidateOtherTokens.mockResolvedValue(undefined);
    mockSendAdminAccountEmail.mockResolvedValue(true);
    mockRecordReissueAudit.mockResolvedValue(undefined);
  });

  describe('正常系', () => {
    it('リンクを再発行してメールを送る', async () => {
      mockAdminRoleLookup('admin');

      const response = await POST(createRequest(), createContext());
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockSendAdminAccountEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'someone@example.com',
          username: 'issued-1',
          setupUrl: 'http://localhost/account/setup?token=plain-token',
          isReissue: true,
        }),
      );
    });

    it('監査ログを残す', async () => {
      mockAdminRoleLookup('admin');

      await POST(createRequest(), createContext());

      expect(mockRecordReissueAudit).toHaveBeenCalledWith(
        expect.anything(),
        'admin-1',
        ACCOUNT_ID,
      );
    });
  });

  /**
   * 古いリンクの無効化（#1223）
   *
   * 送信前に消していたため、送信に失敗すると相手の手元にあった有効な
   * リンクだけが死に、新しいリンクは誰にも届かなかった
   */
  describe('古いリンクの無効化', () => {
    it('送信に成功したら古いリンクを無効化する', async () => {
      mockAdminRoleLookup('admin');

      await POST(createRequest(), createContext());

      expect(mockInvalidateOtherTokens).toHaveBeenCalledWith(
        expect.anything(),
        ACCOUNT_ID,
        'plain-token',
      );
    });

    it('送信に失敗したら古いリンクを残す', async () => {
      // ここで消すと、相手は到達不能になる。admin には送信失敗としか
      // 出ないので、壊したことが伝わらない
      mockAdminRoleLookup('admin');
      mockSendAdminAccountEmail.mockResolvedValue(false);

      const response = await POST(createRequest(), createContext());
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error.message).toBe(ADMIN_ACCOUNT_MESSAGES.EMAIL_SEND_FAILED);
      expect(mockInvalidateOtherTokens).not.toHaveBeenCalled();
    });

    it('送信より後に無効化する', async () => {
      // 順序が逆だと #1223 に戻る
      mockAdminRoleLookup('admin');
      const order: string[] = [];
      mockSendAdminAccountEmail.mockImplementation(async () => {
        order.push('send');
        return true;
      });
      mockInvalidateOtherTokens.mockImplementation(async () => {
        order.push('invalidate');
      });

      await POST(createRequest(), createContext());

      expect(order).toEqual(['send', 'invalidate']);
    });

    it('送信に失敗したら監査ログも残さない', async () => {
      mockAdminRoleLookup('admin');
      mockSendAdminAccountEmail.mockResolvedValue(false);

      await POST(createRequest(), createContext());

      expect(mockRecordReissueAudit).not.toHaveBeenCalled();
    });
  });

  describe('認証・認可', () => {
    it('未認証なら401', async () => {
      mockGetAuthSession.mockResolvedValue(null);

      const response = await POST(createRequest(), createContext());

      expect(response.status).toBe(401);
      expect(mockIssuePasswordResetToken).not.toHaveBeenCalled();
    });

    it('admin でなければ拒否する', async () => {
      mockAdminRoleLookup('user');

      const response = await POST(createRequest(), createContext());

      expect(response.status).toBe(403);
      expect(mockSendAdminAccountEmail).not.toHaveBeenCalled();
    });
  });

  describe('対象の絞り込み', () => {
    it('発行アカウントでなければ404', async () => {
      // メールを持つ通常のアカウントは利用者自身がリセットを使える。
      // admin が差し替えられるとバックドアの範囲が全体へ広がる
      mockAdminRoleLookup('admin');
      mockFindReissuableAccount.mockResolvedValue(null);

      const response = await POST(createRequest(), createContext());
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.message).toBe(
        ADMIN_ACCOUNT_MESSAGES.NOT_ISSUED_ACCOUNT,
      );
      expect(mockIssuePasswordResetToken).not.toHaveBeenCalled();
    });

    it('UUID でない id は400（存在の有無を明かさない）', async () => {
      // 404 と 400 を使い分けると、id の形が合っているかどうかで
      // 応答が変わる。形式不正は検証エラーとして返す
      mockAdminRoleLookup('admin');

      const response = await POST(createRequest(), createContext('not-a-uuid'));

      expect(response.status).toBe(400);
      expect(mockFindReissuableAccount).not.toHaveBeenCalled();
    });
  });

  describe('入力バリデーション', () => {
    it('宛先が不正なら400', async () => {
      mockAdminRoleLookup('admin');

      const response = await POST(
        createRequest({ email: 'not-an-email' }),
        createContext(),
      );

      expect(response.status).toBe(400);
      expect(mockSendAdminAccountEmail).not.toHaveBeenCalled();
    });
  });

  /**
   * レート制限と検証の順序（`.claude/rules/api-route.md`）
   *
   * ⚠️ `withAdminAuth` が handler の前に自前で1層目を回すため、
   * `mockResolvedValueOnce` を1つだけ積むと1層目が消費して handler に
   * 入る前に 429 が返る。2層目を落とすには明示的に1層目を通す
   */
  describe('処理順', () => {
    it('レート制限超過かつ入力が不正なら429（検証より前に判定する）', async () => {
      mockAdminRoleLookup('admin');
      mockCheckRateLimit
        .mockResolvedValueOnce({ allowed: true }) // admin_role_check
        .mockResolvedValueOnce({ allowed: false, retryAfter: 600 }); // ルート固有

      const response = await POST(
        createRequest({ email: 'not-an-email' }),
        createContext(),
      );

      expect(response.status).toBe(429);
      expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        'admin-1',
        'admin_account_issue',
        expect.any(Number),
        expect.any(Number),
      );
    });
  });
});
