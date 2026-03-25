/**
 * Next.js Proxy テスト
 */

// next/serverをモック
const mockNextResponseNext = jest.fn();
const mockNextResponseRedirect = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    next: () => {
      const response = {
        headers: new Headers(),
      };
      mockNextResponseNext.mockReturnValue(response);
      return response;
    },
    redirect: (url: URL) => {
      const response = {
        headers: new Headers({ location: url.toString() }),
      };
      mockNextResponseRedirect.mockReturnValue(response);
      return response;
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { proxy } = require('./proxy') as {
  proxy: (req: unknown) => { headers: Headers };
};

/** テスト用のモックリクエストを生成 */
function createMockRequest(options: {
  pathname: string;
  hasSessionCookie?: boolean;
}) {
  const origin = 'http://localhost:3000';
  return {
    nextUrl: new URL(options.pathname, origin),
    cookies: {
      has: (name: string) =>
        !!options.hasSessionCookie && name === 'next-auth.session-token',
    },
  };
}

describe('proxy', () => {
  beforeEach(() => {
    mockNextResponseNext.mockClear();
    mockNextResponseRedirect.mockClear();
  });

  describe('未認証アクセス（cookieなし）', () => {
    it('保護ページにアクセスするとサインインにリダイレクトする', () => {
      const req = createMockRequest({
        pathname: '/watchlist',
        hasSessionCookie: false,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toContain('/auth/signin');
    });

    it('お気に入りページにアクセスするとサインインにリダイレクトする', () => {
      const req = createMockRequest({
        pathname: '/favorites',
        hasSessionCookie: false,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toContain('/auth/signin');
    });

    it('設定ページにアクセスするとサインインにリダイレクトする', () => {
      const req = createMockRequest({
        pathname: '/settings',
        hasSessionCookie: false,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toContain('/auth/signin');
    });

    it('非保護ページにアクセスするとそのまま表示する', () => {
      const req = createMockRequest({
        pathname: '/movies/upcoming',
        hasSessionCookie: false,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toBeNull();
    });

    it('認証ページにアクセスするとそのまま表示する', () => {
      const req = createMockRequest({
        pathname: '/auth/signin',
        hasSessionCookie: false,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toBeNull();
    });
  });

  describe('認証済みアクセス（cookieあり）', () => {
    it('認証ページにアクセスするとホームにリダイレクトする', () => {
      const req = createMockRequest({
        pathname: '/auth/signin',
        hasSessionCookie: true,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toContain(
        'http://localhost:3000/',
      );
      expect(response.headers.get('location')).not.toContain('/auth/');
    });

    it('新規登録ページにアクセスするとホームにリダイレクトする', () => {
      const req = createMockRequest({
        pathname: '/auth/signup',
        hasSessionCookie: true,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toContain(
        'http://localhost:3000/',
      );
      expect(response.headers.get('location')).not.toContain('/auth/');
    });

    it('保護ページにアクセスするとそのまま表示する', () => {
      const req = createMockRequest({
        pathname: '/favorites',
        hasSessionCookie: true,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toBeNull();
    });

    it('非保護ページにアクセスするとそのまま表示する', () => {
      const req = createMockRequest({
        pathname: '/movies/now-showing',
        hasSessionCookie: true,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toBeNull();
    });
  });
});
