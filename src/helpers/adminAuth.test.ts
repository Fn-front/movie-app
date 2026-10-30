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
});
