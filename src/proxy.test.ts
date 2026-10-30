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
  auth?: { user: { id: string }; totpPending?: boolean } | null;
  // 無効化済みセッションは user.id が空文字になる（auth.ts の session コールバック）
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

  describe('第2要素（二段階認証）が未了のセッション', () => {
    /** OAuthログイン直後で、まだ認証コードを入れていない状態 */
    const pendingAuth = { user: { id: '' }, totpPending: true };

    it.each([
      ['保護ページ', '/favorites'],
      ['非保護ページ', '/movies/now-showing'],
      ['ホーム', '/'],
      ['設定', '/settings'],
    ])('%s へのアクセスを認証コード入力へ向ける', (_label, pathname) => {
      const req = createMockRequest({
        pathname,
        auth: pendingAuth,
        hasSessionCookie: true,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toContain('/auth/two-factor');
    });

    it('認証コード入力ページ自体は通す', () => {
      const req = createMockRequest({
        pathname: '/auth/two-factor',
        auth: pendingAuth,
        hasSessionCookie: true,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toBeNull();
    });

    it('ログインページへ戻ろうとしても認証コード入力へ向ける', () => {
      // 未了のまま他の経路でログインし直せると、第2要素を回避できてしまう
      const req = createMockRequest({
        pathname: '/auth/signin',
        auth: pendingAuth,
        hasSessionCookie: true,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toContain('/auth/two-factor');
    });

    it('第2要素が済んだセッションは認証コード入力ページから追い出す', () => {
      const req = createMockRequest({
        pathname: '/auth/two-factor',
        auth: mockAuth,
        hasSessionCookie: true,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toBe('http://localhost:3000/');
    });

    it('未認証で認証コード入力ページに来たらログインへ向ける', () => {
      const req = createMockRequest({
        pathname: '/auth/two-factor',
        auth: null,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toContain('/auth/signin');
    });
  });

  describe('境界値: callbackUrl 生成', () => {
    it('保護ページへの未認証アクセス時、クエリ文字列を含む callbackUrl が生成される', () => {
      const req = createMockRequest({
        pathname: '/favorites',
        auth: null,
        hasSessionCookie: false,
      });
      // search を持たせる（createMockRequest は new URL(pathname) で組み立てるので追加で書き換える）
      req.nextUrl.search = '?tab=recent&sort=asc';

      const response = proxy(req);
      const location = response.headers.get('location');

      // callbackUrl はエンコード済み: /favorites?tab=recent&sort=asc
      expect(location).toContain(
        'callbackUrl=%2Ffavorites%3Ftab%3Drecent%26sort%3Dasc',
      );
    });

    it('クエリなしの保護ページアクセスでは callbackUrl にパスのみが含まれる', () => {
      const req = createMockRequest({
        pathname: '/watchlist',
        auth: null,
        hasSessionCookie: false,
      });

      const response = proxy(req);
      const location = response.headers.get('location');

      expect(location).toContain('callbackUrl=%2Fwatchlist');
      expect(location).not.toContain('%3F'); // クエリを表す '?' を含まない
    });
  });

  describe('admin 専用パス', () => {
    const adminAuth = { user: { id: 'admin-1', role: 'admin' } };
    const userAuth = { user: { id: 'user-1', role: 'user' } };

    it('admin はアクセスできる', () => {
      const req = createMockRequest({
        pathname: '/admin/accounts',
        auth: adminAuth,
      });

      proxy(req);

      expect(mockNextResponseNext).toHaveBeenCalled();
    });

    // 404 ではなくホームへ送る。存在を隠しても守りにならない
    // （APIを直接叩けば分かる）ため、素直にリダイレクトする
    it('一般ユーザーはホームへリダイレクトされる', () => {
      const req = createMockRequest({
        pathname: '/admin/accounts',
        auth: userAuth,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toContain('/');
      expect(response.headers.get('location')).not.toContain('/admin');
    });

    it('role を持たないセッションもホームへリダイレクトされる', () => {
      const req = createMockRequest({
        pathname: '/admin/accounts',
        auth: { user: { id: 'user-1' } },
      });

      const response = proxy(req);

      expect(response.headers.get('location')).not.toContain('/admin');
    });

    it('未認証はサインインへリダイレクトされる（戻り先を保持）', () => {
      const req = createMockRequest({
        pathname: '/admin/accounts',
        auth: null,
        hasSessionCookie: false,
      });

      const response = proxy(req);
      const location = response.headers.get('location');

      expect(location).toContain('/auth/signin');
      expect(location).toContain('callbackUrl=%2Fadmin%2Faccounts');
    });

    it('配下のパスも startsWith で保護される', () => {
      const req = createMockRequest({
        pathname: '/admin/accounts/new',
        auth: userAuth,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).not.toContain('/admin');
    });

    // `/api/*` は冒頭で素通しされる。ロールの最終判定は withAdminAuth が行う
    it('/api/admin/* は proxy を素通りする', () => {
      const req = createMockRequest({
        pathname: '/api/admin/accounts',
        auth: userAuth,
      });

      proxy(req);

      expect(mockNextResponseNext).toHaveBeenCalled();
    });
  });

  describe('境界値: protectedPaths / authPaths のマッチング', () => {
    it('動的セグメント /theater-experience/[slug] も startsWith で保護される', () => {
      const req = createMockRequest({
        pathname: '/theater-experience/imax-osaka-expocity',
        auth: null,
        hasSessionCookie: false,
      });

      const response = proxy(req);
      const location = response.headers.get('location');

      expect(location).toContain('/auth/signin');
      expect(location).toContain(
        'callbackUrl=%2Ftheater-experience%2Fimax-osaka-expocity',
      );
    });

    it('/settings も未認証時はサインインにリダイレクトされる', () => {
      const req = createMockRequest({
        pathname: '/settings',
        auth: null,
        hasSessionCookie: false,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toContain(
        'callbackUrl=%2Fsettings',
      );
    });

    it('認証済で /auth/signup にアクセスするとホームにリダイレクトされる', () => {
      const req = createMockRequest({
        pathname: '/auth/signup',
        auth: mockAuth,
        hasSessionCookie: true,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toContain(
        'http://localhost:3000/',
      );
      expect(response.headers.get('location')).not.toContain('/auth/');
    });

    it('/auth/error は authPaths 外なので、認証済でもホームにリダイレクトされず表示される', () => {
      const req = createMockRequest({
        pathname: '/auth/error',
        auth: mockAuth,
        hasSessionCookie: true,
      });

      const response = proxy(req);

      // リダイレクトされずに通過（location ヘッダなし）
      expect(response.headers.get('location')).toBeNull();
    });

    it('未認証で /auth/signin にアクセスしても通過する（リダイレクトループを防ぐ）', () => {
      const req = createMockRequest({
        pathname: '/auth/signin',
        auth: null,
        hasSessionCookie: false,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toBeNull();
      expect(mockNextResponseNext).toHaveBeenCalled();
    });
  });

  describe('境界値: ローカル/Preview 環境での /api/* 素通し', () => {
    it('VERCEL_ENV 未設定時、/api/* は認証判定をスキップして通過する', () => {
      const req = createMockRequest({
        pathname: '/api/watchlist',
        auth: null,
        hasSessionCookie: false,
      });

      const response = proxy(req);

      expect(mockNextResponseNext).toHaveBeenCalled();
      expect(response.status).toBe(200);
      // NextAuth の API は認証情報なしでも proxy を通過する必要がある
      expect(response.headers.get('location')).toBeNull();
    });

    it('VERCEL_ENV="preview" では /api/* は素通し（本番404封鎖の対象外）', () => {
      process.env.VERCEL_ENV = 'preview';
      try {
        const req = createMockRequest({
          pathname: '/api/auth/session',
          auth: null,
          hasSessionCookie: false,
        });

        const response = proxy(req);

        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
      } finally {
        // 後続テストへの副作用を防ぐため即時復元（上位 beforeEach でも delete されるが多重防御）
        delete process.env.VERCEL_ENV;
      }
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

  describe('無効化済みセッション（パスワード変更・絶対期限切れ）', () => {
    // session コールバックは無効化時も user を空文字で埋めたオブジェクトを返すため、
    // req.auth 自体は truthy になる。存在確認で判定すると認証済み扱いになり、
    // パスワード変更による強制失効が画面遷移レベルで効かない
    const invalidatedAuth = { user: { id: '' } };

    it('保護パスはサインインへリダイレクトする', () => {
      const req = createMockRequest({
        pathname: '/favorites',
        auth: invalidatedAuth,
      });

      const response = proxy(req);

      const location = response.headers.get('location');
      expect(location).toContain('/auth/signin');
      expect(location).toContain('callbackUrl=%2Ffavorites');
    });

    it('サインインページへは通す（ホームへ飛ばして再ログインを塞がない）', () => {
      const req = createMockRequest({
        pathname: '/auth/signin',
        auth: invalidatedAuth,
      });

      const response = proxy(req);

      expect(response.headers.get('location')).toBeNull();
      expect(mockNextResponseNext).toHaveBeenCalled();
    });

    it('cookieが残っていれば削除する', () => {
      const req = createMockRequest({
        pathname: '/',
        auth: invalidatedAuth,
        hasSessionCookie: true,
      });

      proxy(req);

      expect(mockCookiesDelete).toHaveBeenCalledWith('next-auth.session-token');
    });

    it('公開パスはそのまま表示できる', () => {
      const req = createMockRequest({ pathname: '/', auth: invalidatedAuth });

      const response = proxy(req);

      expect(response.headers.get('location')).toBeNull();
      expect(mockNextResponseNext).toHaveBeenCalled();
    });
  });
});
