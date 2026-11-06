/**
 * @jest-environment node
 */

/**
 * 管理者発行アカウント API Route テスト（GET のレート制限）
 *
 * #934 で `GET /api/admin/accounts` にレート制限を入れた際に新設した。
 * POST 側の発行フローは本ファイルの対象外（別途テストが要る）。
 */

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

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockListIssuedAccounts = jest.fn();
jest.mock('@/lib/auth/adminAccount', () => ({
  listIssuedAccounts: (...args: unknown[]) => mockListIssuedAccounts(...args),
  createIssuedAccount: jest.fn(),
}));

// --- Helpers ---

const createGetRequest = () =>
  new Request('http://localhost/api/admin/accounts');

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

    it('admin 判定を通る前にレート制限は消費しない（現状の記録 / #965）', async () => {
      // ⚠️ これは「望ましい仕様」ではなく**現状の記録**。
      // `withAdminAuth` はロールをDBから読んでから handler を呼ぶため、
      // 非 admin が連打すると `users` への SELECT が無制限に走り、
      // カウンタは消費されない。#934 の動機と矛盾するので #965 で扱う。
      // 方針が決まったらこのテストごと書き換えること
      mockAdminRoleLookup('user');

      await GET(createGetRequest());

      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });
  });
});
