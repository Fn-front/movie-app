/**
 * Next.js Middleware テスト
 */

// next/serverをモック
const mockNextResponseNext = jest.fn();
const mockNextResponseRedirect = jest.fn();
const mockCookiesDelete = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    next: () => {
      const response = {
        headers: new Headers(),
        cookies: { delete: mockCookiesDelete },
      };
      mockNextResponseNext.mockReturnValue(response);
      return response;
    },
    redirect: (url: URL) => {
      const response = {
        headers: new Headers({ location: url.toString() }),
        cookies: { delete: mockCookiesDelete },
      };
      mockNextResponseRedirect.mockReturnValue(response);
      return response;
    },
  },
}));

// ResponseグローバルをJest環境に追加
global.Response = class MockResponse {
  headers: Headers;
  constructor(_body?: unknown, init?: { headers?: Record<string, string> }) {
    this.headers = new Headers(init?.headers);
  }
  static redirect(url: URL) {
    return new MockResponse(null, {
      headers: { location: url.toString() },
    });
  }
} as unknown as typeof Response;

// auth()をパススルーモックにして、コールバック関数をそのまま返す
jest.mock('@/lib/auth/auth', () => ({
  auth: (callback: (...args: unknown[]) => unknown) => callback,
}));

// middleware.tsのdefault exportはauth(callback)の結果＝callback自体
import middleware from './middleware';

/** テスト用のモックリクエストを生成 */
function createMockRequest(options: {
  pathname: string;
  auth?: { user: { id: string } } | null;
  hasSessionCookie?: boolean;
}) {
  const origin = 'http://localhost:3000';
  return {
    auth: options.auth ?? null,
    nextUrl: new URL(options.pathname, origin),
    cookies: {
      has: (name: string) =>
        options.hasSessionCookie && name === 'next-auth.session-token',
    },
  };
}

describe('middleware', () => {
  const mockAuth = { user: { id: 'user-1' } };

  beforeEach(() => {
    mockNextResponseNext.mockClear();
    mockNextResponseRedirect.mockClear();
    mockCookiesDelete.mockClear();
  });

  describe('セッション期限切れ検知（cookie残存）', () => {
    it('非保護ページでcookieありauth無しの場合、cookieを削除してページを表示する', () => {
      const req = createMockRequest({
        pathname: '/movies/now-showing',
        auth: null,
        hasSessionCookie: true,
      });

      const response = middleware(req) as { headers: Headers; cookies: { delete: jest.Mock } };

      // NextResponse.next()が返される（リダイレクトではない）
      expect(response.headers.get('location')).toBeNull();
      // cookieが削除される
      expect(mockCookiesDelete).toHaveBeenCalledWith('next-auth.session-token');
    });

    it('保護ページでcookieありauth無しの場合、cookieを削除してサインインにリダイレクトする', () => {
      const req = createMockRequest({
        pathname: '/dashboard',
        auth: null,
        hasSessionCookie: true,
      });

      const response = middleware(req) as { headers: Headers; cookies: { delete: jest.Mock } };

      expect(response.headers.get('location')).toContain('/auth/signin');
      expect(mockCookiesDelete).toHaveBeenCalledWith('next-auth.session-token');
    });
  });

  describe('未認証アクセス（cookieなし）', () => {
    it('保護ページにアクセスするとサインインにリダイレクトする', () => {
      const req = createMockRequest({
        pathname: '/watchlist',
        auth: null,
        hasSessionCookie: false,
      });

      const response = middleware(req) as { headers: Headers };

      expect(response.headers.get('location')).toContain('/auth/signin');
    });

    it('非保護ページにアクセスするとそのまま表示する', () => {
      const req = createMockRequest({
        pathname: '/movies/upcoming',
        auth: null,
        hasSessionCookie: false,
      });

      const response = middleware(req);

      expect(response).toBeUndefined();
    });
  });

  describe('認証済みアクセス', () => {
    it('認証ページにアクセスするとホームにリダイレクトする', () => {
      const req = createMockRequest({
        pathname: '/auth/signin',
        auth: mockAuth,
        hasSessionCookie: true,
      });

      const response = middleware(req) as { headers: Headers };

      expect(response.headers.get('location')).toContain('http://localhost:3000/');
      expect(response.headers.get('location')).not.toContain('/auth/');
    });

    it('保護ページにアクセスするとそのまま表示する', () => {
      const req = createMockRequest({
        pathname: '/dashboard',
        auth: mockAuth,
        hasSessionCookie: true,
      });

      const response = middleware(req);

      expect(response).toBeUndefined();
    });

    it('非保護ページにアクセスするとそのまま表示する', () => {
      const req = createMockRequest({
        pathname: '/movies/now-showing',
        auth: mockAuth,
        hasSessionCookie: true,
      });

      const response = middleware(req);

      expect(response).toBeUndefined();
    });
  });
});
