/**
 * Next.js Proxy テスト（旧 middleware.test.ts / Next.js 16 対応）
 */

// next/serverをモック
// mockNextResponseNext は NextResponse.next() の呼び出しを記録する。
const mockNextResponseNext = jest.fn();
const mockNextResponseRedirect = jest.fn();
const mockCookiesDelete = jest.fn();

jest.mock('next/server', () => {
  // new NextResponse(null, { status: 404 }) 呼び出しに対応するためクラスとして定義する
  class MockNextResponse {
    headers: Headers;
    status: number;
    cookies: { delete: jest.Mock };
    constructor(
      _body?: unknown,
      init?: { status?: number; headers?: Record<string, string> },
    ) {
      this.headers = new Headers(init?.headers);
      this.status = init?.status ?? 200;
      this.cookies = { delete: mockCookiesDelete };
    }
    static next(init?: { request?: { headers?: Headers } }) {
      mockNextResponseNext(init);
      return new MockNextResponse();
    }
    static redirect(url: URL) {
      const response = new MockNextResponse(null, {
        headers: { location: url.toString() },
      });
      mockNextResponseRedirect.mockReturnValue(response);
      return response;
    }
  }
  return { NextResponse: MockNextResponse };
});

// ResponseグローバルをJest環境に追加
global.Response = class MockResponse {
  headers: Headers;
  status: number;
  constructor(
    _body?: unknown,
    init?: { status?: number; headers?: Record<string, string> },
  ) {
    this.headers = new Headers(init?.headers);
    this.status = init?.status ?? 200;
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

// proxy.tsの named export `proxy` は auth(callback) の結果＝callback自体
// eslint-disable-next-line @typescript-eslint/no-require-imports
const proxy = require('./proxy').proxy as (req: unknown) => {
  headers: Headers;
  status?: number;
  cookies?: { delete: jest.Mock };
};

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
    headers: new Headers(),
    cookies: {
      has: (name: string) =>
        options.hasSessionCookie && name === 'next-auth.session-token',
    },
  };
}

describe('proxy', () => {
  const mockAuth = { user: { id: 'user-1' } };
  const originalVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    mockNextResponseNext.mockClear();
    mockNextResponseRedirect.mockClear();
    mockCookiesDelete.mockClear();
    // 既定はローカル環境として扱う
    delete process.env.VERCEL_ENV;
  });

  afterAll(() => {
    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalVercelEnv;
    }
  });

  describe('Vercel本番デプロイ（VERCEL_ENV=production）', () => {
    beforeEach(() => {
      process.env.VERCEL_ENV = 'production';
    });

    it('/api/cron/* は通過する（Vercel Cronのため）', () => {
      const req = createMockRequest({
        pathname: '/api/cron/sync-movies',
        auth: null,
        hasSessionCookie: false,
      });

      const response = proxy(req);

      expect(mockNextResponseNext).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('トップページは404で隠す', () => {
      const req = createMockRequest({
        pathname: '/',
        auth: null,
        hasSessionCookie: false,
      });

      const response = proxy(req);

      expect(response.status).toBe(404);
    });

    it('保護ページは404で隠す（サインインへリダイレクトしない）', () => {
      const req = createMockRequest({
        pathname: '/favorites',
        auth: null,
        hasSessionCookie: false,
      });

      const response = proxy(req);

      expect(response.status).toBe(404);
      expect(response.headers.get('location')).toBeNull();
    });

    it('cron以外の /api/* は404で隠す', () => {
      const req = createMockRequest({
        pathname: '/api/watchlist',
        auth: mockAuth,
        hasSessionCookie: true,
      });

      const response = proxy(req);

      expect(response.status).toBe(404);
    });
  });

  describe('セッション期限切れ検知（cookie残存）', () => {
    it('非保護ページでcookieありauth無しの場合、cookieを削除してページを表示する', () => {
      const req = createMockRequest({
        pathname: '/movies/now-showing',
        auth: null,
        hasSessionCookie: true,
      });

      const response = proxy(req);

      // NextResponse.next()が返される（リダイレクトではない）
      expect(response.headers.get('location')).toBeNull();
      // cookieが削除される
      expect(mockCookiesDelete).toHaveBeenCalledWith('next-auth.session-token');
    });

    it('保護ページでcookieありauth無しの場合、cookieを削除してサインインにリダイレクトする', () => {
      const req = createMockRequest({
        pathname: '/favorites',
        auth: null,
        hasSessionCookie: true,
      });

      const response = proxy(req);

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

      const response = proxy(req);

      expect(response.headers.get('location')).toContain('/auth/signin');
    });

    it('非保護ページにアクセスするとそのまま表示する', () => {
      const req = createMockRequest({
        pathname: '/movies/upcoming',
        auth: null,
        hasSessionCookie: false,
      });

      const response = proxy(req);

      // リダイレクトではなく通常応答（location ヘッダが無い）
      expect(response.headers.get('location')).toBeNull();
    });
  });

  describe('認証済みアクセス', () => {
    it('認証ページにアクセスするとホームにリダイレクトする', () => {
      const req = createMockRequest({
        pathname: '/auth/signin',
        auth: mockAuth,
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
        auth: mockAuth,
        hasSessionCookie: true,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toBeNull();
    });

    it('非保護ページにアクセスするとそのまま表示する', () => {
      const req = createMockRequest({
        pathname: '/movies/now-showing',
        auth: mockAuth,
        hasSessionCookie: true,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toBeNull();
    });
  });

  describe('CSP / nonce を付与しない（静的配信へ移行）', () => {
    it('通常応答に Content-Security-Policy ヘッダを設定しない（next.config で静的配信）', () => {
      const req = createMockRequest({
        pathname: '/movies/now-showing',
        auth: mockAuth,
        hasSessionCookie: true,
      });

      const response = proxy(req);

      expect(response.headers.get('content-security-policy')).toBeNull();
    });

    it('NextResponse.next() に x-nonce/CSP を載せたリクエストヘッダを渡さない', () => {
      const req = createMockRequest({
        pathname: '/movies/now-showing',
        auth: mockAuth,
        hasSessionCookie: true,
      });

      proxy(req);

      // 認証のみのため init（{ request: { headers } }）は渡されない
      const init = mockNextResponseNext.mock.calls[0][0];
      expect(init).toBeUndefined();
    });
  });
});
