/**
 * @jest-environment node
 */

/**
 * admin 専用ミドルウェア テスト
 */

import { NextResponse } from 'next/server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { withAdminAuth } from './adminAuth';

// requireActual は使わない。@/helpers/auth は next-auth（ESM）を引き込むため
// Jest がパースできない（routeHandler.test.ts と同じ方針）
const mockGetAuthSession = jest.fn();
const mockUnauthorizedResponse = jest.fn(() =>
  NextResponse.json({ success: false }, { status: 401 }),
);
jest.mock('@/helpers/auth', () => ({
  getAuthSession: () => mockGetAuthSession(),
  unauthorizedResponse: () => mockUnauthorizedResponse(),
}));

const mockCreateServiceRoleClient = jest.fn();
const mockDbConnectionErrorResponse = jest.fn(() =>
  NextResponse.json({ success: false }, { status: 500 }),
);
jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
  dbConnectionErrorResponse: () => mockDbConnectionErrorResponse(),
}));

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

/** users.role を返す Supabase クライアントを作る */
function createSupabase(role: string | null) {
  const maybeSingle = jest.fn().mockResolvedValue({
    data: role === null ? null : { role },
    error: null,
  });

  return {
    from: jest.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    })),
  } as unknown as SupabaseClient;
}

const OPTIONS = { errorLog: 'test', errorMessage: 'テストに失敗しました' };

function makeRequest(): Request {
  return new Request('http://localhost/api/admin/accounts');
}

describe('withAdminAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthSession.mockResolvedValue({ user: { id: 'admin-1' } });
    mockCreateServiceRoleClient.mockReturnValue(createSupabase('admin'));
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  });

  it('admin ならハンドラーを実行する', async () => {
    const handler = jest.fn().mockResolvedValue(Response.json({ ok: true }));

    const res = await withAdminAuth(handler, OPTIONS)(makeRequest());

    expect(handler).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('未認証なら 401 を返しハンドラーを実行しない', async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const handler = jest.fn();

    const res = await withAdminAuth(handler, OPTIONS)(makeRequest());

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  // ログイン済みで権限が足りないだけなので、再ログインしても解決しない。
  // 401 と区別して 403 を返す
  it('一般ユーザーなら 403 を返しハンドラーを実行しない', async () => {
    mockCreateServiceRoleClient.mockReturnValue(createSupabase('user'));
    const handler = jest.fn();

    const res = await withAdminAuth(handler, OPTIONS)(makeRequest());

    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('ユーザーが見つからない場合も 403 を返す', async () => {
    mockCreateServiceRoleClient.mockReturnValue(createSupabase(null));
    const handler = jest.fn();

    const res = await withAdminAuth(handler, OPTIONS)(makeRequest());

    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('DBクライアントを作れない場合は 500 を返す', async () => {
    mockCreateServiceRoleClient.mockReturnValue(null);
    const handler = jest.fn();

    const res = await withAdminAuth(handler, OPTIONS)(makeRequest());

    expect(res.status).toBe(500);
    expect(handler).not.toHaveBeenCalled();
  });

  // JWT の role は最大5分古い値になりうる（PASSWORD_CHECK_INTERVAL_MS 間隔でしか
  // 追従しない）。admin 操作は最も強い権限なので毎回DBで確認する
  it('ロールはセッションではなくDBから読む', async () => {
    const supabase = createSupabase('admin');
    mockCreateServiceRoleClient.mockReturnValue(supabase);
    mockGetAuthSession.mockResolvedValue({
      // セッション側が admin を名乗っていても、判定には使わない
      user: { id: 'admin-1', role: 'user' },
    });

    await withAdminAuth(
      jest.fn().mockResolvedValue(Response.json({})),
      OPTIONS,
    )(makeRequest());

    expect(supabase.from).toHaveBeenCalledWith('users');
  });

  it('ハンドラーが投げた例外は 500 に畳む', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const handler = jest.fn().mockRejectedValue(new Error('boom'));

    const res = await withAdminAuth(handler, OPTIONS)(makeRequest());

    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('params をハンドラーへ渡す', async () => {
    const handler = jest.fn().mockResolvedValue(Response.json({}));
    const params = Promise.resolve({ id: 'u1' });

    await withAdminAuth(handler, OPTIONS)(makeRequest(), { params });

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ params }));
  });

  describe('ロール確認のレート制限（#965）', () => {
    it('セッション単位で admin_role_check として数える', async () => {
      const handler = jest.fn().mockResolvedValue(Response.json({}));

      await withAdminAuth(handler, OPTIONS)(makeRequest());

      expect(mockCheckRateLimit).toHaveBeenCalledWith(
        expect.anything(),
        'admin-1',
        'admin_role_check',
        120,
        1,
      );
    });

    it('非 admin でもカウンタを消費する', async () => {
      // ここが本題。消費しないと、ログイン済みの非 admin が連打するだけで
      // `users` への SELECT を無制限に走らせられる
      const supabase = createSupabase('user');
      mockCreateServiceRoleClient.mockReturnValue(supabase);
      const handler = jest.fn();

      const res = await withAdminAuth(handler, OPTIONS)(makeRequest());

      expect(res.status).toBe(403);
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    });

    it('上限超過なら429を返し、ロールをDBから読まない', async () => {
      const supabase = createSupabase('admin');
      mockCreateServiceRoleClient.mockReturnValue(supabase);
      mockCheckRateLimit.mockResolvedValueOnce({
        allowed: false,
        retryAfter: 60,
      });
      const handler = jest.fn();

      const res = await withAdminAuth(handler, OPTIONS)(makeRequest());

      expect(res.status).toBe(429);
      expect(supabase.from).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    it('ロール確認より前に消費する', async () => {
      // 順序が逆だと、403 のパスでカウンタに触れない
      const order: string[] = [];
      mockCheckRateLimit.mockImplementationOnce(async () => {
        order.push('rateLimit');
        return { allowed: true };
      });
      const supabase = {
        from: jest.fn(() => {
          order.push('roleLookup');
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { role: 'admin' },
                  error: null,
                }),
              }),
            }),
          };
        }),
      } as unknown as SupabaseClient;
      mockCreateServiceRoleClient.mockReturnValue(supabase);

      await withAdminAuth(
        jest.fn().mockResolvedValue(Response.json({})),
        OPTIONS,
      )(makeRequest());

      expect(order).toEqual(['rateLimit', 'roleLookup']);
    });
  });
});
