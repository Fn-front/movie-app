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
      // 1層目（`withAdminAuth` の admin_role_check / #965）を明示的に通して
      // から、2層目のルート固有の制限を落とす。Once を1つしか積まないと
      // 1層目で 429 になり、ルート側の制限を一度も通らない（POST 側の
      // `処理順` describe に詳細）
      mockCheckRateLimit
        .mockResolvedValueOnce({ allowed: true })
        .mockResolvedValueOnce({ allowed: false, retryAfter: 600 });

      const response = await GET(createGetRequest());

      expect(response.status).toBe(429);
      expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        'admin-1',
        'read_api_user_data',
        expect.anything(),
        expect.anything(),
      );
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
      // テーブル名も固定する。消す先が変わってもモックは素通りするため
      expect(mockFrom).toHaveBeenNthCalledWith(2, 'users');
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

  it('設定リンクを発行できなかったときもアカウントを消す', async () => {
    // メール送信まで辿り着かない経路。ここで消さないと、送信失敗と同じ
    // 「気づけないまま使えないアカウントが残る」状態になる
    // throw は `withAdminAuth` が握って 500 にする際にログへ出す。
    // 想定内なのでテスト出力は黙らせる
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockAdminRoleLookup('admin');
    mockIssuePasswordResetToken.mockRejectedValue(new Error('insert failed'));
    mockUserDelete();

    const response = await POST(createPostRequest());

    expect(response.status).toBe(500);
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'issued-user-1');
    expect(mockSendAdminAccountEmail).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  describe('処理順', () => {
    /**
     * レート制限は**2層**ある。1層目は `withAdminAuth` が handler の前に
     * 自前で呼ぶ `admin_role_check`（`src/helpers/adminAuth.ts` / #965）、
     * 2層目が POST ハンドラ内の `admin_account_issue`。
     *
     * ⚠️ `mockResolvedValueOnce` を1つ積むだけだと**1層目が食べてしまい**、
     * ハンドラに入る前に 429 で返る。それでも 429 は観測できるので
     * テストは緑になるが、固定したい「ハンドラ内のレート制限 → 検証」の
     * 順序は何も検証できていない（実際そうなっていた）。
     * 1層目を明示的に通してから2層目を落とす
     */
    const allowRoleCheckThen = (handlerLimit: { allowed: boolean }) => {
      mockCheckRateLimit
        .mockResolvedValueOnce({ allowed: true })
        .mockResolvedValueOnce(handlerLimit);
    };

    it('レート制限超過なら、入力が不正でも429を返す', async () => {
      // レート制限 → 検証 の順を固定する（`.claude/rules/api-route.md`）。
      // 逆だと、形式だけ崩したリクエストでカウンタを消費せずに試行できる
      mockAdminRoleLookup('admin');
      allowRoleCheckThen({ allowed: false });

      const response = await POST(createPostRequest('not-an-email'));

      expect(response.status).toBe(429);
      expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        'admin-1',
        'admin_account_issue',
        expect.anything(),
        expect.anything(),
      );
      expect(mockCreateIssuedAccount).not.toHaveBeenCalled();
    });

    it('レート制限内なら、入力が不正なときだけ400を返す', async () => {
      // 429 側だけだと「常に429」でも通る。400 と対にして順序を挟み込む
      mockAdminRoleLookup('admin');
      allowRoleCheckThen({ allowed: true });

      const response = await POST(createPostRequest('not-an-email'));

      expect(response.status).toBe(400);
      expect(mockCreateIssuedAccount).not.toHaveBeenCalled();
    });
  });
});
