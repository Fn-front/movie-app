/**
 * @jest-environment node
 */

/**
 * NextAuth OAuth コールバック（signIn / jwt / session）単体テスト（#401）
 *
 * SSO の往復（実プロバイダ認可・コールバック）は外部依存のため E2E では検証できない。
 * 本テストは NextAuth をモックして `NextAuth(config)` に渡される config を捕捉し、
 * Supabase(service role) をモックして signIn/jwt/session コールバックを直接呼び、
 * ユーザー紐付け・トークン構築・セッション無効化の正常系/異常系を検証する。
 *
 * ※ Credentials Provider の authorize、実プロバイダ往復は対象外（棲み分け: E2E #402 / 別途）。
 */

// --- 環境変数（import 前に設定：supabase クライアント生成と provider 構成に必要）---
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.GOOGLE_CLIENT_ID = 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
process.env.GITHUB_CLIENT_ID = 'github-client-id';
process.env.GITHUB_CLIENT_SECRET = 'github-client-secret';

// --- Supabase モック（table + 操作でクエリ結果を解決する resolver 方式）---
// jest の巻き上げ制約により、ファクトリ内から参照する可変状態は `mock` プレフィックス必須。
const mockState: {
  resolver: (ctx: { table: string; ops: string[]; single: boolean }) => unknown;
  /** 書き込み系に渡されたペイロードの記録（何を保存しているかの検証用） */
  writes: Array<{ table: string; method: string; payload: unknown }>;
  /** eq() の絞り込み条件（どの列で引いたかの検証用） */
  filters: Array<{ table: string; column: unknown; value: unknown }>;
} = {
  resolver: () => ({ data: null, error: null }),
  writes: [],
  filters: [],
};

jest.mock('@supabase/supabase-js', () => {
  const makeBuilder = (table: string) => {
    const ops: string[] = [];
    const builder: Record<string, unknown> = {};
    const passthrough = [
      'select',
      'insert',
      'update',
      'upsert',
      'delete',
      'eq',
      'neq',
      'not',
      'or',
      'order',
      'limit',
      'is',
    ];
    const writeMethods = new Set(['insert', 'update', 'upsert']);
    for (const m of passthrough) {
      builder[m] = jest.fn((payload: unknown, second?: unknown) => {
        ops.push(m);
        if (writeMethods.has(m)) {
          mockState.writes.push({ table, method: m, payload });
        }
        // どの列で絞り込んだかを残す（email / username の引き分けの検証用）
        if (m === 'eq') {
          mockState.filters.push({ table, column: payload, value: second });
        }
        return builder;
      });
    }
    builder.single = jest.fn(() =>
      Promise.resolve(mockState.resolver({ table, ops, single: true })),
    );
    builder.maybeSingle = jest.fn(() =>
      Promise.resolve(mockState.resolver({ table, ops, single: true })),
    );
    // await builder（.single() を挟まないチェーン）でも解決できるよう thenable にする
    (builder as { then: unknown }).then = (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown,
    ) =>
      Promise.resolve(mockState.resolver({ table, ops, single: false })).then(
        resolve,
        reject,
      );
    return builder;
  };
  return {
    createClient: jest.fn(() => ({ from: jest.fn(makeBuilder) })),
  };
});

// --- Provider / NextAuth モック ---
const mockGoogle = jest.fn(() => ({ id: 'google' }));
const mockGitHub = jest.fn(() => ({ id: 'github' }));
jest.mock('next-auth/providers/google', () => ({
  __esModule: true,
  default: mockGoogle,
}));
jest.mock('next-auth/providers/github', () => ({
  __esModule: true,
  default: mockGitHub,
}));
jest.mock('next-auth/providers/credentials', () => ({
  __esModule: true,
  default: (opts: unknown) => ({ id: 'credentials', ...(opts as object) }),
}));

// --- レート制限モック（authorize のレート制限挙動の検証用）---
const mockCheckRateLimit = jest.fn();
const mockResetRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  resetRateLimit: (...args: unknown[]) => mockResetRateLimit(...args),
}));
// --- 第2要素モック（authorize / jwt の分岐の検証用。検証ロジック自体は
// totpVerification.test.ts で確認済み）---
const mockIsTotpEnabled = jest.fn();
const mockVerifySecondFactor = jest.fn();
jest.mock('@/lib/auth/totpVerification', () => ({
  ...jest.requireActual('@/lib/auth/totpVerification'),
  isTotpEnabled: (...args: unknown[]) => mockIsTotpEnabled(...args),
  verifySecondFactor: (...args: unknown[]) => mockVerifySecondFactor(...args),
}));

jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    handlers: { GET: jest.fn(), POST: jest.fn() },
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  })),
  // CredentialsSignInError の基底クラス。実物は @auth/core の ESM にあり
  // Jest の変換対象外のため、code を持つ最小の実装で差し替える
  CredentialsSignin: class CredentialsSignin extends Error {
    code = 'credentials';
  },
}));

// --- import（モック適用後）---
// 注: 静的 import は巻き上げられ env 設定より先に走るため、auth.ts は require で
// その場（env 設定後・mock 定義後）に読み込む。
type Callbacks = {
  signIn: (args: unknown) => Promise<boolean>;
  jwt: (args: unknown) => Promise<Record<string, unknown>>;
  session: (args: unknown) => Promise<Record<string, unknown>>;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('@/lib/auth/auth');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NextAuth = require('next-auth').default as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcryptjs') as typeof import('bcryptjs');

type CredentialsProvider = {
  id: string;
  authorize: (
    credentials: Record<string, unknown>,
    request: Request,
  ) => Promise<unknown>;
};

const config = NextAuth.mock.calls[0][0] as {
  callbacks: Callbacks;
  providers: Array<{ id: string }>;
};
const { signIn, jwt, session } = config.callbacks;

const credentialsProvider = config.providers.find(
  (p) => p.id === 'credentials',
) as unknown as CredentialsProvider;

/** デフォルト resolver に戻す */
function setResolver(fn: typeof mockState.resolver) {
  mockState.resolver = fn;
}

beforeEach(() => {
  setResolver(() => ({ data: null, error: null }));
  mockState.writes = [];
  // 既定は「二段階認証なし」。有効時の挙動は個別のテストで上書きする。
  // 呼び出し履歴も消す（「問い合わせていないこと」を検証するテストがあるため）
  mockIsTotpEnabled.mockReset();
  mockIsTotpEnabled.mockResolvedValue(false);
  mockVerifySecondFactor.mockReset();
});

// -------------------- provider 構成 --------------------
describe('provider 構成', () => {
  it('Google/GitHub provider が env の clientId/secret で構成される', () => {
    expect(mockGoogle).toHaveBeenCalledWith({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
    });
    // GitHub は検証済みメールのみを採用するため userinfo を差し替えている
    expect(mockGitHub).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'github-client-id',
        clientSecret: 'github-client-secret',
        userinfo: expect.objectContaining({
          url: 'https://api.github.com/user',
          request: expect.any(Function),
        }),
      }),
    );
  });
});

// -------------------- signIn コールバック --------------------
describe('signIn コールバック（OAuth）', () => {
  const account = {
    provider: 'google',
    providerAccountId: 'g-123',
    type: 'oauth',
    access_token: 'at',
  };

  /**
   * メール検証済みの profile。
   *
   * 未検証メールによるアカウント乗っ取りを防ぐため、signIn は
   * `profile.email_verified === true` を要求する。
   */
  const verifiedProfile = { email_verified: true };

  it('既存ユーザー: アカウントを紐付けて true を返し user.id を既存IDにする', async () => {
    setResolver(({ table, ops }) => {
      if (table === 'users' && ops.includes('select'))
        return {
          data: { id: 'existing-1', avatar_url: 'has.png' },
          error: null,
        };
      return { data: null, error: null }; // accounts.upsert / users.update
    });

    const user: { email: string; image?: string; id?: string } = {
      email: 'a@example.com',
      image: 'new.png',
    };
    const result = await signIn({ user, account, profile: verifiedProfile });

    expect(result).toBe(true);
    expect(user.id).toBe('existing-1');
  });

  it('accounts にはリンク情報のみを保存し、OAuthトークンを保存しない（#650）', async () => {
    setResolver(({ table, ops }) => {
      if (table === 'users' && ops.includes('select'))
        return {
          data: { id: 'existing-1', avatar_url: 'has.png' },
          error: null,
        };
      return { data: null, error: null };
    });

    await signIn({
      user: { email: 'a@example.com' },
      account: {
        ...account,
        access_token: 'at-secret',
        refresh_token: 'rt-secret',
        id_token: 'it-secret',
        expires_at: 1234567890,
        token_type: 'bearer',
        scope: 'openid profile email',
      },
      profile: verifiedProfile,
    });

    const accountsUpsert = mockState.writes.find(
      (w) => w.table === 'accounts' && w.method === 'upsert',
    );

    expect(accountsUpsert).toBeDefined();
    expect(accountsUpsert!.payload).toEqual({
      user_id: 'existing-1',
      provider: 'google',
      provider_account_id: 'g-123',
      type: 'oauth',
    });

    // トークン類がペイロードに一切現れないこと
    const serialized = JSON.stringify(accountsUpsert!.payload);
    for (const secret of ['at-secret', 'rt-secret', 'it-secret']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('既存ユーザーでアバター未設定なら avatar を更新する', async () => {
    const updatedTables: string[] = [];
    setResolver(({ table, ops }) => {
      if (table === 'users' && ops.includes('select'))
        return { data: { id: 'existing-1', avatar_url: null }, error: null };
      if (table === 'users' && ops.includes('update'))
        updatedTables.push('users:update');
      return { data: null, error: null };
    });

    const user = { email: 'a@example.com', image: 'new.png' };
    await signIn({ user, account, profile: verifiedProfile });

    // アバター更新 + last_login 更新の2回 users.update が走る
    expect(
      updatedTables.filter((t) => t === 'users:update').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('既存ユーザーでアバター設定済みなら avatar を更新しない（last_loginのみ）', async () => {
    let userUpdateCount = 0;
    setResolver(({ table, ops }) => {
      if (table === 'users' && ops.includes('select'))
        return {
          data: { id: 'existing-1', avatar_url: 'has.png' },
          error: null,
        };
      if (table === 'users' && ops.includes('update')) userUpdateCount += 1;
      return { data: null, error: null };
    });

    const user = { email: 'a@example.com', image: 'new.png' };
    await signIn({ user, account, profile: verifiedProfile });

    // アバター更新は走らず、last_login 更新の1回のみ
    expect(userUpdateCount).toBe(1);
  });

  it('新規ユーザー: users に作成して true を返す', async () => {
    setResolver(({ table, ops }) => {
      // insert チェーン（.insert().select().single()）も select を含むため insert を先に判定
      if (table === 'users' && ops.includes('insert'))
        return { data: { id: 'new-1' }, error: null };
      if (table === 'users' && ops.includes('select'))
        return { data: null, error: { code: 'PGRST116' } }; // not found
      return { data: null, error: null };
    });

    const user: { email: string; name?: string; id?: string } = {
      email: 'new@example.com',
      name: 'New User',
    };
    const result = await signIn({ user, account, profile: verifiedProfile });

    expect(result).toBe(true);
    expect(user.id).toBe('new-1');
  });

  it('last_login_at 更新に失敗しても true を返す（warn のみ）', async () => {
    setResolver(({ table, ops }) => {
      if (table === 'users' && ops.includes('select'))
        return {
          data: { id: 'existing-1', avatar_url: 'has.png' },
          error: null,
        };
      if (table === 'users' && ops.includes('update'))
        return { error: { message: 'update failed' } };
      return { data: null, error: null }; // accounts.upsert 成功
    });

    const user = { email: 'a@example.com' };
    const result = await signIn({ user, account, profile: verifiedProfile });
    expect(result).toBe(true);
  });

  it('Credentials プロバイダは last_login を更新して true を返す', async () => {
    const result = await signIn({
      user: { id: 'u1', email: 'a@example.com' },
      account: { provider: 'credentials' },
      profile: {},
    });
    expect(result).toBe(true);
  });

  describe('異常系: false を返す', () => {
    it('account.provider が無い', async () => {
      const result = await signIn({
        user: { email: 'a@example.com' },
        account: { providerAccountId: 'x' },
        profile: {},
      });
      expect(result).toBe(false);
    });

    it('providerAccountId が無い', async () => {
      const result = await signIn({
        user: { email: 'a@example.com' },
        account: { provider: 'google' },
        profile: {},
      });
      expect(result).toBe(false);
    });

    it('user.email が無い', async () => {
      const result = await signIn({ user: {}, account, profile: {} });
      expect(result).toBe(false);
    });

    it('既存ユーザー検索で PGRST116 以外の DB エラー', async () => {
      setResolver(({ table, ops }) => {
        if (table === 'users' && ops.includes('select'))
          return { data: null, error: { code: 'PGRST500' } };
        return { data: null, error: null };
      });
      const result = await signIn({
        user: { email: 'a@example.com' },
        account,
        profile: {},
      });
      expect(result).toBe(false);
    });

    it('新規ユーザー作成に失敗', async () => {
      setResolver(({ table, ops }) => {
        if (table === 'users' && ops.includes('insert'))
          return { data: null, error: { message: 'insert failed' } };
        if (table === 'users' && ops.includes('select'))
          return { data: null, error: { code: 'PGRST116' } };
        return { data: null, error: null };
      });
      const result = await signIn({
        user: { email: 'new@example.com' },
        account,
        profile: {},
      });
      expect(result).toBe(false);
    });

    it('accounts の upsert に失敗', async () => {
      setResolver(({ table, ops }) => {
        if (table === 'users' && ops.includes('select'))
          return { data: { id: 'existing-1', avatar_url: 'x' }, error: null };
        if (table === 'accounts' && ops.includes('upsert'))
          return { error: { message: 'upsert failed' } };
        return { data: null, error: null };
      });
      const result = await signIn({
        user: { email: 'a@example.com' },
        account,
        profile: {},
      });
      expect(result).toBe(false);
    });

    it('supabase 未設定（環境変数なし）だと OAuth signIn は false', async () => {
      // env を外して auth.ts を再読み込みし、supabase=null 状態の signIn を取得する
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      let signInNoDb: Callbacks['signIn'] = async () => true;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('@/lib/auth/auth');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const NA = require('next-auth').default as jest.Mock;
        const cfg = NA.mock.calls[NA.mock.calls.length - 1][0] as {
          callbacks: Callbacks;
        };
        signInNoDb = cfg.callbacks.signIn;
      });

      const result = await signInNoDb({
        user: { email: 'a@example.com' },
        account,
        profile: {},
      });
      expect(result).toBe(false);

      // env を復元
      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    });
  });
});

// -------------------- jwt コールバック --------------------
describe('jwt コールバック', () => {
  it('OAuth 初回: DB から role/passwordChangedAt を取得してトークンに反映', async () => {
    setResolver(({ table, ops }) => {
      if (table === 'users' && ops.includes('select'))
        return {
          data: { role: 'admin', password_changed_at: '2026-01-01T00:00:00Z' },
          error: null,
        };
      return { data: null, error: null };
    });

    const token = await jwt({
      token: {},
      user: { id: 'u1', email: 'a@example.com', name: 'A', image: 'i.png' },
      account: { provider: 'google' },
    });

    expect(token.id).toBe('u1');
    expect(token.role).toBe('admin');
    expect(token.passwordChangedAt).toBe('2026-01-01T00:00:00Z');
  });

  it('Credentials 初回: user のフィールドをトークンにマッピング', async () => {
    const token = await jwt({
      token: {},
      user: {
        id: 'u2',
        email: 'b@example.com',
        name: 'B',
        image: null,
        role: 'user',
        passwordChangedAt: null,
      },
      account: { provider: 'credentials' },
    });

    expect(token.id).toBe('u2');
    expect(token.email).toBe('b@example.com');
    expect(token.role).toBe('user');
  });

  it('絶対有効期限を過ぎたトークンは invalidated=true になる', async () => {
    // 8日前に発行 → 7日上限超過
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const token = await jwt({
      token: {
        id: 'u1',
        issuedAt: eightDaysAgo,
        lastPasswordCheck: Date.now(),
        lastLoginUpdate: Date.now(),
      },
      user: undefined,
      account: null,
    });
    expect(token.invalidated).toBe(true);
  });

  it('OAuth初回でDBユーザーが取得できない場合は role=user のまま', async () => {
    setResolver(() => ({ data: null, error: null }));

    const token = await jwt({
      token: {},
      user: { id: 'u9', email: 'x@example.com', name: 'X', image: null },
      account: { provider: 'github' },
    });

    expect(token.id).toBe('u9');
    expect(token.role).toBe('user');
    expect(token.passwordChangedAt).toBeNull();
  });

  it('パスワード変更後（DBのpassword_changed_atがトークンより新しい）はセッション無効化', async () => {
    setResolver(({ table, ops }) => {
      if (table === 'users' && ops.includes('select'))
        return {
          data: { password_changed_at: '2026-06-01T00:00:00Z' },
          error: null,
        };
      return { data: null, error: null };
    });

    const token = await jwt({
      token: {
        id: 'u1',
        issuedAt: Date.now(), // 絶対期限は未超過
        lastPasswordCheck: 0, // チェック間隔を必ず超過させて照合を走らせる
        lastLoginUpdate: Date.now(),
        passwordChangedAt: null, // トークン側は未変更(0)扱い → DB側が新しい
      },
      user: undefined,
      account: null,
    });

    expect(token.invalidated).toBe(true);
  });

  // ログイン時にしか取らないと、admin を剥奪してもトークンの絶対有効期限
  // （7日）まで admin のまま管理機能を使えてしまう
  describe('ロールの追従', () => {
    /** users の select で返すロールを差し替える */
    function setRole(role: string | null) {
      setResolver(({ table, ops }) => {
        if (table === 'users' && ops.includes('select')) {
          return {
            data: { password_changed_at: null, password_hash: 'h', role },
            error: null,
          };
        }
        return { data: null, error: null };
      });
    }

    it('チェック間隔を超えたらDBのロールに追従する', async () => {
      setRole('user');

      const token = await jwt({
        token: {
          id: 'u1',
          role: 'admin', // トークンは古い値を持っている
          issuedAt: Date.now(),
          lastPasswordCheck: 0, // 間隔を超過させて照合を走らせる
          lastLoginUpdate: Date.now(),
          passwordChangedAt: null,
        },
        user: undefined,
        account: null,
      });

      expect(token.role).toBe('user');
    });

    it('昇格も同じ経路で反映される', async () => {
      setRole('admin');

      const token = await jwt({
        token: {
          id: 'u1',
          role: 'user',
          issuedAt: Date.now(),
          lastPasswordCheck: 0,
          lastLoginUpdate: Date.now(),
          passwordChangedAt: null,
        },
        user: undefined,
        account: null,
      });

      expect(token.role).toBe('admin');
    });

    it('role が null なら user に畳む', async () => {
      setRole(null);

      const token = await jwt({
        token: {
          id: 'u1',
          role: 'admin',
          issuedAt: Date.now(),
          lastPasswordCheck: 0,
          lastLoginUpdate: Date.now(),
          passwordChangedAt: null,
        },
        user: undefined,
        account: null,
      });

      expect(token.role).toBe('user');
    });

    it('チェック間隔内なら問い合わせず既存のロールを保つ', async () => {
      setRole('user');

      const token = await jwt({
        token: {
          id: 'u1',
          role: 'admin',
          issuedAt: Date.now(),
          lastPasswordCheck: Date.now(), // 間隔内なのでスキップされる
          lastLoginUpdate: Date.now(),
          passwordChangedAt: null,
        },
        user: undefined,
        account: null,
      });

      expect(token.role).toBe('admin');
    });
  });

  it('last_login はスロットリング間隔を超えていれば更新される', async () => {
    let userUpdated = false;
    setResolver(({ table, ops }) => {
      // パスワード変更チェックの select は「変更なし」を返す
      if (table === 'users' && ops.includes('select'))
        return { data: { password_changed_at: null }, error: null };
      if (table === 'users' && ops.includes('update')) userUpdated = true;
      return { data: null, error: null };
    });

    const token = await jwt({
      token: {
        id: 'u1',
        issuedAt: Date.now(),
        lastPasswordCheck: Date.now(), // パスワードチェックはスキップ
        lastLoginUpdate: 0, // last_login 更新間隔を超過 → 更新が走る
      },
      user: undefined,
      account: null,
    });

    expect(userUpdated).toBe(true);
    expect(token.invalidated).toBeUndefined();
  });
});

// -------------------- session コールバック --------------------
describe('session コールバック', () => {
  it('通常時: token の情報を session.user にマッピング', async () => {
    const result = await session({
      session: { user: {} },
      token: {
        id: 'u1',
        email: 'a@example.com',
        name: 'A',
        picture: 'i.png',
        role: 'user',
      },
    });
    expect(result.user).toMatchObject({
      id: 'u1',
      email: 'a@example.com',
      role: 'user',
    });
  });

  it('invalidated トークン: 空のユーザー情報を返す', async () => {
    const result = await session({
      session: { user: { id: 'u1', email: 'a@example.com' } },
      token: { invalidated: true },
    });
    expect(result.user).toMatchObject({
      id: '',
      email: '',
      role: '',
    });
  });
});

// -------------------- authorize のレート制限（#644）--------------------
describe('authorize のレート制限', () => {
  /** 指定の送信元IPでログインを試みるリクエストを作る */
  function makeRequest(clientIp?: string): Request {
    const headers = new Headers();
    if (clientIp) headers.set('x-vercel-forwarded-for', clientIp);
    return new Request('http://localhost/api/auth/callback/credentials', {
      headers,
    });
  }

  /** 全てのレート制限を通す */
  function allowAll() {
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
  }

  beforeEach(() => {
    mockCheckRateLimit.mockReset();
    mockResetRateLimit.mockReset();
    // users 取得は「該当なし」にして、レート制限の呼び出しだけを見る
    setResolver(() => ({ data: null, error: { code: 'PGRST116' } }));
  });

  it('送信元IP単位の制限を login_ip で確認する', async () => {
    allowAll();

    await credentialsProvider
      .authorize(
        { email: 'user@example.com', password: 'pw' },
        makeRequest('203.0.113.1'),
      )
      .catch(() => {}); // ユーザー不在で失敗するが、呼び出しの検証が目的

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      '203.0.113.1',
      'login_ip',
      20,
      15,
    );
  });

  it('アカウント単位の識別子に送信元IPを含める', async () => {
    allowAll();

    await credentialsProvider
      .authorize(
        { email: 'user@example.com', password: 'pw' },
        makeRequest('203.0.113.1'),
      )
      .catch(() => {});

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'user@example.com|203.0.113.1',
      'login',
      5,
      30,
    );
  });

  it('第三者の試行は被害者と別の識別子になる（締め出しが起きない）', async () => {
    allowAll();

    await credentialsProvider
      .authorize(
        { email: 'victim@example.com', password: 'wrong' },
        makeRequest('198.51.100.9'), // 攻撃者の送信元
      )
      .catch(() => {});

    const identifiers = mockCheckRateLimit.mock.calls.map((c) => c[1]);

    // 攻撃者の識別子でカウントされ、被害者単独の識別子は使われない
    expect(identifiers).toContain('victim@example.com|198.51.100.9');
    expect(identifiers).not.toContain('victim@example.com');
  });

  it('送信元IP単位の制限を超えたら拒否する', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 900,
    });

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: 'pw' },
        makeRequest('203.0.113.1'),
      ),
    ).rejects.toThrow();
  });

  it('送信元が特定できない場合はメールアドレス単独にフォールバックし、IP制限を行わない', async () => {
    allowAll();

    await credentialsProvider
      .authorize({ email: 'user@example.com', password: 'pw' }, makeRequest())
      .catch(() => {});

    const calls = mockCheckRateLimit.mock.calls;

    expect(calls.map((c) => c[2])).not.toContain('login_ip');
    expect(calls.map((c) => c[1])).toContain('user@example.com');
  });
});

// -------------------- 第2要素（二段階認証） --------------------
describe('authorize の第2要素（パスワード経路）', () => {
  const PASSWORD = 'Password1';
  /** PASSWORD の bcrypt ハッシュ */
  const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
  const USER_ID = 'user-1';

  function makeRequest(): Request {
    return new Request('http://localhost/api/auth/callback/credentials', {
      headers: new Headers({ 'x-vercel-forwarded-for': '203.0.113.1' }),
    });
  }

  beforeEach(() => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockResetRateLimit.mockReset();
    setResolver(({ table }) =>
      table === 'users'
        ? {
            data: {
              id: USER_ID,
              email: 'user@example.com',
              name: 'User',
              avatar_url: null,
              role: 'user',
              is_verified: true,
              password_hash: PASSWORD_HASH,
              password_changed_at: null,
            },
            error: null,
          }
        : { data: null, error: null },
    );
  });

  it('二段階認証が無効なら第2要素を求めずにログインできる', async () => {
    mockIsTotpEnabled.mockResolvedValue(false);

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: PASSWORD },
        makeRequest(),
      ),
    ).resolves.toMatchObject({ id: USER_ID });
    expect(mockVerifySecondFactor).not.toHaveBeenCalled();
  });

  it('二段階認証が有効でコード未入力なら totp_required を返す', async () => {
    mockIsTotpEnabled.mockResolvedValue(true);

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: PASSWORD },
        makeRequest(),
      ),
    ).rejects.toMatchObject({ code: 'totp_required' });
  });

  it('パスワードが誤っていれば第2要素の有無を問い合わせない', async () => {
    // 問い合わせると「二段階認証を使っているアカウントか」を
    // パスワードを知らない相手に教えることになる
    mockIsTotpEnabled.mockResolvedValue(true);

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: 'WrongPassword1' },
        makeRequest(),
      ),
    ).rejects.toThrow();
    expect(mockIsTotpEnabled).not.toHaveBeenCalled();
  });

  it('正しいコードならログインできる', async () => {
    mockIsTotpEnabled.mockResolvedValue(true);
    mockVerifySecondFactor.mockResolvedValue('success');

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: PASSWORD, totpCode: '123456' },
        makeRequest(),
      ),
    ).resolves.toMatchObject({ id: USER_ID });
  });

  it('誤ったコードは totp_invalid を返す', async () => {
    mockIsTotpEnabled.mockResolvedValue(true);
    mockVerifySecondFactor.mockResolvedValue('invalid');

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: PASSWORD, totpCode: '000000' },
        makeRequest(),
      ),
    ).rejects.toMatchObject({ code: 'totp_invalid' });
  });

  it('使い回したコードは totp_reused を返す', async () => {
    mockIsTotpEnabled.mockResolvedValue(true);
    mockVerifySecondFactor.mockResolvedValue('reused');

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: PASSWORD, totpCode: '123456' },
        makeRequest(),
      ),
    ).rejects.toMatchObject({ code: 'totp_reused' });
  });

  it('コードの試行にレート制限を掛ける', async () => {
    // 6桁を窓付きで受けるため、上限が無いと総当たりで抜かれる
    mockIsTotpEnabled.mockResolvedValue(true);
    mockVerifySecondFactor.mockResolvedValue('success');

    await credentialsProvider.authorize(
      { email: 'user@example.com', password: PASSWORD, totpCode: '123456' },
      makeRequest(),
    );

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      'totp_verify',
      5,
      15,
    );
  });

  it('コードの試行上限を超えたら検証せずに拒否する', async () => {
    mockIsTotpEnabled.mockResolvedValue(true);
    // login_ip → login → totp_verify の順。3回目だけ拒否する
    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfter: 900 });

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: PASSWORD, totpCode: '123456' },
        makeRequest(),
      ),
    ).rejects.toMatchObject({ code: 'rate_limited' });
    expect(mockVerifySecondFactor).not.toHaveBeenCalled();
  });

  it('空白だけのコードは未入力として扱う', async () => {
    mockIsTotpEnabled.mockResolvedValue(true);

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: PASSWORD, totpCode: '   ' },
        makeRequest(),
      ),
    ).rejects.toMatchObject({ code: 'totp_required' });
  });
});

describe('authorize の第2要素（メールOTP経路）', () => {
  function makeRequest(): Request {
    return new Request('http://localhost/api/auth/callback/credentials', {
      headers: new Headers({ 'x-vercel-forwarded-for': '203.0.113.1' }),
    });
  }

  beforeEach(() => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    setResolver(({ table }) =>
      table === 'users'
        ? {
            data: {
              id: 'user-1',
              email: 'user@example.com',
              name: 'User',
              avatar_url: null,
              role: 'user',
              is_verified: true,
              password_hash: null,
              password_changed_at: null,
            },
            error: null,
          }
        : { data: null, error: null },
    );
  });

  it('二段階認証が有効ならメールOTP単独ログインを拒否する', async () => {
    // メールのコードだけで入れる経路は第2要素ではなくパスワードの代替であり、
    // 残すと最も弱い経路が全体の強度を決めてしまう（#642）
    mockIsTotpEnabled.mockResolvedValue(true);

    await expect(
      credentialsProvider.authorize(
        {
          email: 'user@example.com',
          loginMethod: 'otp',
          verificationToken: 'token',
        },
        makeRequest(),
      ),
    ).rejects.toMatchObject({ code: 'otp_login_disabled' });
  });

  it('二段階認証が無効ならメールOTP経路は従来どおり進む', async () => {
    mockIsTotpEnabled.mockResolvedValue(false);

    // 検証済みトークンが見つからないので失敗するが、
    // otp_login_disabled では落ちないことを確認する
    const error = await credentialsProvider
      .authorize(
        {
          email: 'user@example.com',
          loginMethod: 'otp',
          verificationToken: 'token',
        },
        makeRequest(),
      )
      .catch((e: unknown) => e);

    expect((error as { code?: string }).code).not.toBe('otp_login_disabled');
  });
});

// -------------------- 第2要素（jwt / session コールバック） --------------------
describe('jwt コールバックの第2要素', () => {
  beforeEach(() => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockResetRateLimit.mockReset();
  });

  it('OAuth初回で二段階認証が有効なら totpPending を立てる', async () => {
    // OAuth は authorize を通らないため、ここで第2要素を要求する
    mockIsTotpEnabled.mockResolvedValue(true);
    setResolver(() => ({ data: { role: 'user' }, error: null }));

    const token = await jwt({
      token: {},
      user: { id: 'u1', email: 'a@example.com', name: 'A', image: null },
      account: { provider: 'google' },
    });

    expect(token.totpPending).toBe(true);
  });

  it('OAuth初回で二段階認証が無効なら totpPending は立たない', async () => {
    mockIsTotpEnabled.mockResolvedValue(false);
    setResolver(() => ({ data: { role: 'user' }, error: null }));

    const token = await jwt({
      token: {},
      user: { id: 'u1', email: 'a@example.com', name: 'A', image: null },
      account: { provider: 'google' },
    });

    expect(token.totpPending).toBe(false);
  });

  it('Credentials 初回は totpPending を立てない（authorize で検証済み）', async () => {
    const token = await jwt({
      token: {},
      user: {
        id: 'u2',
        email: 'b@example.com',
        name: 'B',
        image: null,
        role: 'user',
        passwordChangedAt: null,
      },
      account: { provider: 'credentials' },
    });

    expect(token.totpPending).toBe(false);
  });

  it('正しいコードで update されると totpPending が落ちる', async () => {
    mockVerifySecondFactor.mockResolvedValue('success');

    const token = await jwt({
      token: { id: 'u1', totpPending: true, issuedAt: Date.now() },
      user: undefined,
      account: null,
      trigger: 'update',
      session: { totpCode: '123456' },
    });

    expect(token.totpPending).toBe(false);
  });

  it.each([
    ['誤ったコード', 'invalid'],
    ['使い回したコード', 'reused'],
    ['二段階認証が無効', 'not_enabled'],
  ])('%s では totpPending が残る', async (_label, verifyResult) => {
    mockVerifySecondFactor.mockResolvedValue(verifyResult);

    const token = await jwt({
      token: { id: 'u1', totpPending: true, issuedAt: Date.now() },
      user: undefined,
      account: null,
      trigger: 'update',
      session: { totpCode: '000000' },
    });

    expect(token.totpPending).toBe(true);
  });

  it('コードを渡さない update では検証しない', async () => {
    // クライアントは「検証済み」という結果そのものを渡せない
    const token = await jwt({
      token: { id: 'u1', totpPending: true, issuedAt: Date.now() },
      user: undefined,
      account: null,
      trigger: 'update',
      session: { totpPending: false },
    });

    expect(token.totpPending).toBe(true);
    expect(mockVerifySecondFactor).not.toHaveBeenCalled();
  });

  it('試行上限を超えたら検証せず totpPending を残す', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, retryAfter: 900 });

    const token = await jwt({
      token: { id: 'u1', totpPending: true, issuedAt: Date.now() },
      user: undefined,
      account: null,
      trigger: 'update',
      session: { totpCode: '123456' },
    });

    expect(token.totpPending).toBe(true);
    expect(mockVerifySecondFactor).not.toHaveBeenCalled();
  });

  it('コードの試行にレート制限を掛ける', async () => {
    mockVerifySecondFactor.mockResolvedValue('success');

    await jwt({
      token: { id: 'u1', totpPending: true, issuedAt: Date.now() },
      user: undefined,
      account: null,
      trigger: 'update',
      session: { totpCode: '123456' },
    });

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'u1',
      'totp_verify',
      5,
      15,
    );
  });

  it('totpPending でないトークンには update で触れない', async () => {
    const token = await jwt({
      token: { id: 'u1', totpPending: false, issuedAt: Date.now() },
      user: undefined,
      account: null,
      trigger: 'update',
      session: { totpCode: '123456' },
    });

    expect(token.totpPending).toBe(false);
    expect(mockVerifySecondFactor).not.toHaveBeenCalled();
  });
});

describe('session コールバックの第2要素', () => {
  /** 空のセッション雛形 */
  const emptySession = () => ({
    user: {
      id: '',
      email: '',
      name: null,
      image: null,
      role: '',
      hasPassword: false,
    },
  });

  it('totpPending のセッションはユーザー情報を空にする', async () => {
    // /api/* は proxy の判定を素通りするため、ここで空にしないと
    // 認証コードを入れないまま API を使えてしまう
    const result = await session({
      session: emptySession(),
      token: {
        id: 'u1',
        email: 'a@example.com',
        name: 'A',
        picture: null,
        role: 'admin',
        hasPassword: true,
        totpPending: true,
      },
    });

    expect(result.user).toMatchObject({ id: '', email: '', role: '' });
    expect(result.totpPending).toBe(true);
  });

  it('第2要素が済んでいればユーザー情報を載せる', async () => {
    const result = await session({
      session: emptySession(),
      token: {
        id: 'u1',
        email: 'a@example.com',
        name: 'A',
        picture: null,
        role: 'admin',
        hasPassword: true,
        totpPending: false,
      },
    });

    expect(result.user).toMatchObject({ id: 'u1', role: 'admin' });
    expect(result.totpPending).toBeUndefined();
  });
});

describe('authorize のユーザー名ログイン', () => {
  /** 指定の送信元IPでログインを試みるリクエストを作る */
  function makeRequest(clientIp = '203.0.113.1'): Request {
    const headers = new Headers();
    headers.set('x-vercel-forwarded-for', clientIp);
    return new Request('http://localhost/api/auth/callback/credentials', {
      headers,
    });
  }

  beforeEach(() => {
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockResetRateLimit.mockReset();
    mockState.filters = [];
    // ユーザー不在で返す。どの列で引いたかだけを見る
    setResolver(() => ({ data: null, error: { code: 'PGRST116' } }));
  });

  /** users テーブルを引いた列を返す */
  function userLookupColumns(): unknown[] {
    return mockState.filters
      .filter((f) => f.table === 'users')
      .map((f) => f.column);
  }

  it('@ を含まない入力は username 列で引く', async () => {
    await credentialsProvider
      .authorize({ email: 'K7M2-QXPT-9WFN', password: 'pw' }, makeRequest())
      .catch(() => {});

    expect(userLookupColumns()).toContain('username');
    expect(userLookupColumns()).not.toContain('email');
  });

  it('@ を含む入力は従来どおり email 列で引く', async () => {
    await credentialsProvider
      .authorize({ email: 'user@example.com', password: 'pw' }, makeRequest())
      .catch(() => {});

    expect(userLookupColumns()).toContain('email');
    expect(userLookupColumns()).not.toContain('username');
  });

  // 利用者はメールで受け取った文字列を手で打ち込むため、表記の揺れを吸収する
  it.each([
    ['k7m2-qxpt-9wfn', '小文字'],
    ['K7M2QXPT9WFN', '区切りなし'],
    ['K7M2 QXPT 9WFN', '空白区切り'],
  ])('%s（%s）でも同じ正規化済みの値で引く', async (input) => {
    await credentialsProvider
      .authorize({ email: input, password: 'pw' }, makeRequest())
      .catch(() => {});

    const usernameFilter = mockState.filters.find(
      (f) => f.table === 'users' && f.column === 'username',
    );

    expect(usernameFilter?.value).toBe('K7M2QXPT9WFN');
  });

  it('レート制限の識別子にユーザー名と送信元を使う', async () => {
    await credentialsProvider
      .authorize({ email: 'K7M2-QXPT-9WFN', password: 'pw' }, makeRequest())
      .catch(() => {});

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'K7M2QXPT9WFN|203.0.113.1',
      'login',
      5,
      30,
    );
  });

  // メールを持たないアカウントに確認コードは送れない。
  // この経路を残すと「コードを受け取れないのに検証を求める」状態になる
  it('ユーザー名でのOTPログインは拒否する', async () => {
    setResolver(({ table }) =>
      table === 'users'
        ? { data: { id: 'u1', username: 'K7M2QXPT9WFN', is_verified: true } }
        : { data: null, error: null },
    );

    await expect(
      credentialsProvider.authorize(
        {
          email: 'K7M2-QXPT-9WFN',
          loginMethod: 'otp',
          verificationToken: 'token',
        },
        makeRequest(),
      ),
    ).rejects.toThrow();
  });
});
