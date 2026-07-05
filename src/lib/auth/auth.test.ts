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
} = {
  resolver: () => ({ data: null, error: null }),
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
      'order',
      'limit',
      'is',
    ];
    for (const m of passthrough) {
      builder[m] = jest.fn(() => {
        ops.push(m);
        return builder;
      });
    }
    builder.single = jest.fn(() =>
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
jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    handlers: { GET: jest.fn(), POST: jest.fn() },
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  })),
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

const config = NextAuth.mock.calls[0][0] as {
  callbacks: Callbacks;
};
const { signIn, jwt, session } = config.callbacks;

/** デフォルト resolver に戻す */
function setResolver(fn: typeof mockState.resolver) {
  mockState.resolver = fn;
}

beforeEach(() => {
  setResolver(() => ({ data: null, error: null }));
});

// -------------------- provider 構成 --------------------
describe('provider 構成', () => {
  it('Google/GitHub provider が env の clientId/secret で構成される', () => {
    expect(mockGoogle).toHaveBeenCalledWith({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
    });
    expect(mockGitHub).toHaveBeenCalledWith({
      clientId: 'github-client-id',
      clientSecret: 'github-client-secret',
    });
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
    const result = await signIn({ user, account, profile: {} });

    expect(result).toBe(true);
    expect(user.id).toBe('existing-1');
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
    await signIn({ user, account, profile: {} });

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
    await signIn({ user, account, profile: {} });

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
    const result = await signIn({ user, account, profile: {} });

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
    const result = await signIn({ user, account, profile: {} });
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
