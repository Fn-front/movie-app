/**
 * @jest-environment node
 */

/**
 * 管理者発行アカウント API Route テスト
 *
 * #934 で `GET /api/admin/accounts` にレート制限を入れた際に新設した。
 * POST 側は #1221（メール送信失敗時のロールバック）で足した。
 */

import { GET, POST } from './route';
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

const mockListIssuedAccounts = jest.fn();
const mockCreateIssuedAccount = jest.fn();
jest.mock('@/lib/auth/adminAccount', () => ({
  listIssuedAccounts: (...args: unknown[]) => mockListIssuedAccounts(...args),
  createIssuedAccount: (...args: unknown[]) => mockCreateIssuedAccount(...args),
}));

const mockIssuePasswordResetToken = jest.fn();
jest.mock('@/lib/auth/passwordResetToken', () => ({
  issuePasswordResetToken: (...args: unknown[]) =>
    mockIssuePasswordResetToken(...args),
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

const createGetRequest = () =>
  new Request('http://localhost/api/admin/accounts');

const createPostRequest = (email = 'someone@example.com') =>
  new Request('http://localhost/api/admin/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
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

describe('GET /api/admin/accounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReset();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'admin-1' } });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockListIssuedAccounts.mockResolvedValue([]);
  });

  it('admin なら一覧を返す', async () => {
    mockAdminRoleLookup('admin');
    mockListIssuedAccounts.mockResolvedValue([
      { id: 'u-1', username: 'issued-1' },
    ]);

    const response = await GET(createGetRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.accounts).toEqual([{ id: 'u-1', username: 'issued-1' }]);
  });

  it('管理情報をCDNや共有キャッシュに残さない', async () => {
    mockAdminRoleLookup('admin');

    const response = await GET(createGetRequest());

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('未認証なら401を返す', async () => {
    mockGetAuthSession.mockResolvedValue(null);

    const response = await GET(createGetRequest());

    expect(response.status).toBe(401);
    expect(mockListIssuedAccounts).not.toHaveBeenCalled();
  });

  it('admin でなければ403を返す', async () => {
    mockAdminRoleLookup('user');

    const response = await GET(createGetRequest());

    expect(response.status).toBe(403);
    expect(mockListIssuedAccounts).not.toHaveBeenCalled();
  });

  describe('レート制限（#934）', () => {
    it('admin 単位で read_api_user_data として数える', async () => {
      mockAdminRoleLookup('admin');

      await GET(createGetRequest());

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'admin-1',
        'read_api_user_data',
        200,
        1,
      );
    });

    it('上限超過で429を返し、一覧を引かない', async () => {
      mockAdminRoleLookup('admin');
      // 他の新規テストと揃えて Once にする。beforeEach の戻しが消されても
      // 以降が全部429経路になることを防ぐ
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        retryAfter: 600,
      });

      const response = await GET(createGetRequest());

      expect(response.status).toBe(429);
      expect(mockListIssuedAccounts).not.toHaveBeenCalled();
    });

    it('admin でなければルート固有のカウンタは消費しない', async () => {
      // ロール確認自体のレート制限は `withAdminAuth` 側（admin_role_check /
      // #965）が受け持つ。READ_USER_DATA は handler に入って初めて消費する
      mockAdminRoleLookup('user');

      await GET(createGetRequest());

      expect(mockCheckRateLimit).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'read_api_user_data',
        expect.anything(),
        expect.anything(),
      );
    });
  });
});

describe('POST /api/admin/accounts', () => {
  /** `supabase.from('users').delete().eq('id', ...)` を捕まえる */
  const mockDeleteEq = jest.fn();

  /**
   * ロールバックの DELETE を1回ぶん積む
   *
   * `mockAdminRoleLookup` の後に積むこと。`withAdminAuth` のロール確認も
   * 同じ `users` テーブルを引くため、区別できるのは呼び出し順だけ
   */
  const mockUserDelete = (error: unknown = null) => {
    mockFrom.mockReturnValueOnce({
      delete: () => ({
        eq: (column: string, value: string) => {
          mockDeleteEq(column, value);
          return Promise.resolve({ error });
        },
      }),
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFrom.mockReset();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'admin-1' } });
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockCreateIssuedAccount.mockResolvedValue({
      userId: 'issued-user-1',
      username: '376DF4GD4BTZ',
    });
    mockIssuePasswordResetToken.mockResolvedValue('plain-token');
    mockSendAdminAccountEmail.mockResolvedValue(true);
  });

  it('送信できたら201を返し、アカウントは消さない', async () => {
    mockAdminRoleLookup('admin');

    const response = await POST(createPostRequest());
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.data.username).toBe('376DF4GD4BTZ');
    expect(mockDeleteEq).not.toHaveBeenCalled();
  });

  describe('メール送信に失敗したとき', () => {
    it('発行したアカウントを削除する', async () => {
      mockAdminRoleLookup('admin');
      mockSendAdminAccountEmail.mockResolvedValue(false);
      mockUserDelete();

      const response = await POST(createPostRequest());
      const json = await response.json();

      expect(response.status).toBe(500);
      expect(json.error.message).toBe(ADMIN_ACCOUNT_MESSAGES.EMAIL_SEND_FAILED);
      expect(mockDeleteEq).toHaveBeenCalledWith('id', 'issued-user-1');
    });

    it('消えたアカウント名をレスポンスに残さない', async () => {
      // 残すと画面が「発行済み」として扱えてしまう。実体はもう無い
      mockAdminRoleLookup('admin');
      mockSendAdminAccountEmail.mockResolvedValue(false);
      mockUserDelete();

      const json = await (await POST(createPostRequest())).json();

      expect(json.data).toBeUndefined();
    });

    it('削除に失敗しても500を返し、気づけるようログへ出す', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockAdminRoleLookup('admin');
      mockSendAdminAccountEmail.mockResolvedValue(false);
      mockUserDelete({ code: '23503' });

      const response = await POST(createPostRequest());

      expect(response.status).toBe(500);
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('376DF4GD4BTZ'),
        expect.objectContaining({ code: '23503' }),
      );

      consoleError.mockRestore();
    });
  });

  describe('処理順', () => {
    it('レート制限超過なら、入力が不正でも429を返す', async () => {
      // レート制限 → 検証 の順を固定する（`.claude/rules/api-route.md`）。
      // 逆だと、形式だけ崩したリクエストでカウンタを消費せずに試行できる
      mockAdminRoleLookup('admin');
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        retryAfter: 600,
      });

      const response = await POST(createPostRequest('not-an-email'));

      expect(response.status).toBe(429);
      expect(mockCreateIssuedAccount).not.toHaveBeenCalled();
    });
  });
});
