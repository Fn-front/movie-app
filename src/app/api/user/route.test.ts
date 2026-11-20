/**
 * @jest-environment node
 */

/**
 * アカウント削除API Route テスト（#932）
 *
 * ⚠️ **取り返しがつかない操作**なので、確認手段の要否判定を厚く見る。
 * 誤って必須にすると退会できない利用者が出るし、誤って外すと
 * セッションを奪った第三者が口封じに消せる。
 */

import { ACCOUNT_DELETE_MESSAGES, VALIDATION_MESSAGES } from '@/constants/auth';

import { DELETE } from './route';

// --- Mocks ---

const mockFrom = jest.fn();
const mockRpc = jest.fn();
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => ({ from: mockFrom, rpc: mockRpc }),
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

const mockGetSecondFactorMethod = jest.fn();
jest.mock('@/lib/auth/secondFactor', () => ({
  getSecondFactorMethod: (...args: unknown[]) =>
    mockGetSecondFactorMethod(...args),
}));

const mockRequireSecondFactor = jest.fn();
jest.mock('@/helpers/secondFactorGuard', () => ({
  requireSecondFactor: (...args: unknown[]) => mockRequireSecondFactor(...args),
}));

const mockCompare = jest.fn();
jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: { compare: (...args: unknown[]) => mockCompare(...args) },
}));

// --- Helpers ---

const createRequest = (body: unknown = {}) =>
  new Request('http://localhost/api/user', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** users の SELECT をモックする */
const mockUserQuery = (passwordHash: string | null, error: unknown = null) => {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: error ? null : { password_hash: passwordHash },
            error,
          }),
      }),
    }),
  });
};

// --- Tests ---

describe('DELETE /api/user', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockGetSecondFactorMethod.mockResolvedValue(null);
    mockRequireSecondFactor.mockResolvedValue(null);
    mockCompare.mockResolvedValue(true);
    mockRpc.mockResolvedValue({ data: 3, error: null });
    mockUserQuery('hashed');
  });

  describe('認証', () => {
    it('未認証で401を返し、削除しない', async () => {
      mockGetAuthSession.mockResolvedValue(null);

      const response = await DELETE(createRequest({ currentPassword: 'pw' }));

      expect(response.status).toBe(401);
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe('レート制限', () => {
    it('上限超過で429を返し、削除しない', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 600 });

      const response = await DELETE(createRequest({ currentPassword: 'pw' }));
      const json = await response.json();

      expect(response.status).toBe(429);
      expect(json.error.details.retryAfter).toBe(600);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('セッションのユーザーIDで数える', async () => {
      await DELETE(createRequest({ currentPassword: 'pw' }));

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        'account_delete',
        expect.any(Number),
        expect.any(Number),
      );
    });
  });

  /**
   * 認証 → レート制限 → バリデーション の順であることの回帰テスト（#940）。
   * 識別子が `session.user.id` なので検証より前に確定しており、逆順だと
   * 形式だけ崩したリクエストでカウンタを消費せずに試行を重ねられる
   * （`.claude/rules/api-route.md`）。
   */
  describe('処理順', () => {
    it('バリデーションエラー時もレート制限を消費する', async () => {
      const response = await DELETE(createRequest({ currentPassword: 123 }));

      expect(response.status).toBe(400);
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    });

    it('壊れたJSONでもレート制限を消費し、400を返す', async () => {
      const response = await DELETE(createRequest('{"currentPassword":'));

      expect(response.status).toBe(400);
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    });

    // レート制限超過 かつ 入力が不正 → 429（検証より前だから）
    it('上限超過と不正入力が重なったら429を返す', async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 600 });

      const response = await DELETE(createRequest({ currentPassword: 123 }));

      expect(response.status).toBe(429);
    });
  });

  describe('パスワードの確認', () => {
    it('パスワードを持つ利用者は再入力が要る', async () => {
      const response = await DELETE(createRequest({}));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toBe(
        VALIDATION_MESSAGES.CURRENT_PASSWORD_REQUIRED,
      );
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('パスワードが違えば400を返し、削除しない', async () => {
      mockCompare.mockResolvedValue(false);

      const response = await DELETE(
        createRequest({ currentPassword: 'wrong' }),
      );

      expect(response.status).toBe(400);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ **ソーシャル連携のみの利用者は `password_hash` が NULL**
     * （`20260312000000` で NULL 許容になった）。
     *
     * 必須にすると照合できる値が無いので**永久に退会できなくなる**。
     */
    it('パスワードを持たない利用者は再入力なしで削除できる', async () => {
      mockUserQuery(null);

      const response = await DELETE(createRequest({}));

      expect(response.status).toBe(200);
      expect(mockCompare).not.toHaveBeenCalled();
      expect(mockRpc).toHaveBeenCalled();
    });
  });

  describe('第2要素の確認', () => {
    it('設定済みならコードを検証する', async () => {
      mockGetSecondFactorMethod.mockResolvedValue('totp');

      await DELETE(createRequest({ currentPassword: 'pw', code: '123456' }));

      expect(mockRequireSecondFactor).toHaveBeenCalledWith(
        expect.anything(),
        'user-1',
        '123456',
      );
    });

    it('コードが不正なら削除しない', async () => {
      mockGetSecondFactorMethod.mockResolvedValue('totp');
      mockRequireSecondFactor.mockResolvedValue(
        new Response(JSON.stringify({ success: false }), { status: 400 }),
      );

      const response = await DELETE(
        createRequest({ currentPassword: 'pw', code: '000000' }),
      );

      expect(response.status).toBe(400);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    /**
     * ⚠️ `requireSecondFactor` は未設定だと「設定されていません」の 400 を
     * 返す。無条件に呼ぶと**第2要素を使っていない利用者が退会できなくなる**。
     */
    it('未設定なら検証そのものを呼ばない', async () => {
      const response = await DELETE(createRequest({ currentPassword: 'pw' }));

      expect(response.status).toBe(200);
      expect(mockRequireSecondFactor).not.toHaveBeenCalled();
    });
  });

  describe('削除', () => {
    it('RPC をセッションのユーザーIDで呼ぶ', async () => {
      const response = await DELETE(createRequest({ currentPassword: 'pw' }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('delete_user_account', {
        p_user_id: 'user-1',
      });
    });

    it('RPC が失敗したら500を返す', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

      const response = await DELETE(createRequest({ currentPassword: 'pw' }));
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error.message).toBe(ACCOUNT_DELETE_MESSAGES.FAILED);
    });

    // セッションはあるが行が無い（既に消えている等）
    it('利用者が見つからなければ404を返す', async () => {
      mockUserQuery(null, { code: 'PGRST116' });

      const response = await DELETE(createRequest({ currentPassword: 'pw' }));

      expect(response.status).toBe(404);
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });
});
