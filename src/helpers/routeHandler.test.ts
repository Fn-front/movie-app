/**
 * @jest-environment node
 */

/**
 * withAuth ミドルウェアのテスト
 *
 * getAuthSession / createServiceRoleClient / handleRouteError を全て差し替え、
 * 認証チェック→Supabase初期化→ハンドラー呼び出しの流れを検証する。
 */

import { NextResponse } from 'next/server';

const mockGetAuthSession = jest.fn();
const mockUnauthorizedResponse = jest.fn();
const mockCreateServiceRoleClient = jest.fn();
const mockDbConnectionErrorResponse = jest.fn();
const mockHandleRouteError = jest.fn();

jest.mock('@/helpers/auth', () => ({
  getAuthSession: () => mockGetAuthSession(),
  unauthorizedResponse: () => mockUnauthorizedResponse(),
}));

jest.mock('@/helpers/supabase', () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
  dbConnectionErrorResponse: () => mockDbConnectionErrorResponse(),
}));

jest.mock('@/helpers/routeError', () => ({
  handleRouteError: (...args: unknown[]) => mockHandleRouteError(...args),
}));

import { withAuth } from './routeHandler';

const makeRequest = () => new Request('http://localhost/api/test');

describe('withAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('未認証時は unauthorizedResponse を返しハンドラーを呼ばない', async () => {
    const unauthResponse = NextResponse.json({}, { status: 401 });
    mockGetAuthSession.mockResolvedValue(null);
    mockUnauthorizedResponse.mockReturnValue(unauthResponse);

    const handler = jest.fn();
    const wrapped = withAuth(handler, {
      errorLog: 'log',
      errorMessage: 'msg',
    });

    const response = await wrapped(makeRequest());

    expect(response).toBe(unauthResponse);
    expect(handler).not.toHaveBeenCalled();
    expect(mockCreateServiceRoleClient).not.toHaveBeenCalled();
  });

  it('Supabaseクライアント初期化失敗時は dbConnectionErrorResponse を返す', async () => {
    const dbErrorResponse = NextResponse.json({}, { status: 503 });
    mockGetAuthSession.mockResolvedValue({ user: { id: 'u1' } });
    mockCreateServiceRoleClient.mockReturnValue(null);
    mockDbConnectionErrorResponse.mockReturnValue(dbErrorResponse);

    const handler = jest.fn();
    const wrapped = withAuth(handler, {
      errorLog: 'log',
      errorMessage: 'msg',
    });

    const response = await wrapped(makeRequest());

    expect(response).toBe(dbErrorResponse);
    expect(handler).not.toHaveBeenCalled();
  });

  it('認証・DB初期化成功時はハンドラーが呼ばれ結果が返る', async () => {
    const okResponse = NextResponse.json({ ok: true }, { status: 200 });
    const supabase = { from: jest.fn() };
    const session = { user: { id: 'user-1' } };

    mockGetAuthSession.mockResolvedValue(session);
    mockCreateServiceRoleClient.mockReturnValue(supabase);

    const handler = jest.fn().mockResolvedValue(okResponse);
    const wrapped = withAuth(handler, {
      errorLog: 'log',
      errorMessage: 'msg',
    });

    const request = makeRequest();
    const response = await wrapped(request);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      session,
      supabase,
      request,
      params: undefined,
    });
    expect(response).toBe(okResponse);
  });

  it('動的ルート context.params がハンドラーに渡される', async () => {
    const params = Promise.resolve({ id: 'abc' });
    const supabase = { from: jest.fn() };

    mockGetAuthSession.mockResolvedValue({ user: { id: 'u' } });
    mockCreateServiceRoleClient.mockReturnValue(supabase);

    const handler = jest.fn().mockResolvedValue(NextResponse.json({}));
    const wrapped = withAuth(handler, {
      errorLog: 'log',
      errorMessage: 'msg',
    });

    await wrapped(makeRequest(), { params });

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ params }));
  });

  it('ハンドラーが throw した場合、handleRouteError にエラーが渡される', async () => {
    const errorResponse = NextResponse.json({}, { status: 500 });
    const thrown = new Error('boom');

    mockGetAuthSession.mockResolvedValue({ user: { id: 'u' } });
    mockCreateServiceRoleClient.mockReturnValue({ from: jest.fn() });
    mockHandleRouteError.mockReturnValue(errorResponse);

    const handler = jest.fn().mockRejectedValue(thrown);
    const wrapped = withAuth(handler, {
      errorLog: 'test-log',
      errorMessage: 'test-msg',
    });

    const response = await wrapped(makeRequest());

    expect(mockHandleRouteError).toHaveBeenCalledWith(
      thrown,
      'test-log',
      'test-msg',
    );
    expect(response).toBe(errorResponse);
  });

  it('境界値: getAuthSession が throw しても handleRouteError で捕捉される', async () => {
    const errorResponse = NextResponse.json({}, { status: 500 });
    const thrown = new Error('session load failed');

    mockGetAuthSession.mockRejectedValue(thrown);
    mockHandleRouteError.mockReturnValue(errorResponse);

    const handler = jest.fn();
    const wrapped = withAuth(handler, {
      errorLog: 'log',
      errorMessage: 'msg',
    });

    const response = await wrapped(makeRequest());

    expect(handler).not.toHaveBeenCalled();
    expect(mockHandleRouteError).toHaveBeenCalledWith(thrown, 'log', 'msg');
    expect(response).toBe(errorResponse);
  });
});
