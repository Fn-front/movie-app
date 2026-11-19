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
// secondFactor.test.ts で確認済み）---
const mockSendSecondFactorCode = jest.fn();
jest.mock('@/lib/auth/sendSecondFactorCode', () => ({
  ...jest.requireActual('@/lib/auth/sendSecondFactorCode'),
  sendSecondFactorCode: (...args: unknown[]) =>
    mockSendSecondFactorCode(...args),
}));

const mockGetSecondFactorMethod = jest.fn();
const mockVerifySecondFactor = jest.fn();
jest.mock('@/lib/auth/secondFactor', () => ({
  ...jest.requireActual('@/lib/auth/secondFactor'),
  getSecondFactorMethod: (...args: unknown[]) =>
    mockGetSecondFactorMethod(...args),
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

import {
  AUTH_ERROR_CODE,
  DUMMY_PASSWORD_HASH,
  SESSION_CONFIG,
} from '@/constants/auth';
import { SECOND_FACTOR_METHOD } from '@/constants/secondFactor';
import { __resetSessionUserLookupForTest } from '@/lib/auth/sessionUserLookup';

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
  // ⚠️ 必須（#1281）。`users` の問い合わせは1秒だけ共有される。
  // テストは同じユーザーIDを1秒以内に何度も使うため、消さないと
  // 前のテストの resolver の結果を引き継いでしまう
  __resetSessionUserLookupForTest();
  setResolver(() => ({ data: null, error: null }));
  mockState.writes = [];
  // 既定は「二段階認証なし」。有効時の挙動は個別のテストで上書きする。
  // 呼び出し履歴も消す（「問い合わせていないこと」を検証するテストがあるため）
  mockGetSecondFactorMethod.mockReset();
  mockGetSecondFactorMethod.mockResolvedValue(null);
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

  /**
   * トークンがベースラインを持っている場合の比較
   *
   * ⚠️ **ここを見るテストが1本も無かった**（#1207 のレビューで判明）。
   * 三項の truthy 側を「絶対に失効しない」値へ潰しても全件通る状態で、
   * **本番の主経路——過去に変更した利用者のセッションを次の変更で切る——が
   * 無防備だった**。
   *
   * ⚠️ `issuedAt` は**変更日時より後**に置く。`issuedAt` 基準なら失効しない
   * 配置にすることで、`passwordChangedAt` 側が使われていることまで見える
   */
  it('トークンが持つ変更日時より DB が新しければ無効化する', async () => {
    const tokenChangedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const dbChangedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    setResolver(({ table, ops }) => {
      if (table === 'users' && ops.includes('select'))
        return { data: { password_changed_at: dbChangedAt }, error: null };
      return { data: null, error: null };
    });

    const token = await jwt({
      token: {
        id: 'u1',
        // 発行は「今」。issuedAt を基準にすると失効しないので、
        // トークンの passwordChangedAt が使われていることが分かる
        issuedAt: Date.now(),
        lastPasswordCheck: 0,
        lastLoginUpdate: Date.now(),
        passwordChangedAt: tokenChangedAt,
      },
      user: undefined,
      account: null,
    });

    expect(token.invalidated).toBe(true);
  });

  /**
   * ⚠️ `issuedAt` は**変更日時より前**に置く。`issuedAt` 基準だと失効して
   * しまう配置なので、ここでもトークン側の値が使われていることが分かる
   */
  it('トークンと DB の変更日時が同じなら失効しない', async () => {
    const changedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    setResolver(({ table, ops }) => {
      if (table === 'users' && ops.includes('select'))
        return { data: { password_changed_at: changedAt }, error: null };
      return { data: null, error: null };
    });

    const token = await jwt({
      token: {
        id: 'u1',
        issuedAt: Date.now() - 2 * 60 * 60 * 1000,
        lastPasswordCheck: 0,
        lastLoginUpdate: Date.now(),
        passwordChangedAt: changedAt,
      },
      user: undefined,
      account: null,
    });

    expect(token.invalidated).toBeUndefined();
  });

  it('ベースラインが無いトークンは、発行後の変更で無効化する', async () => {
    // ⚠️ 日時は**発行時刻を基準に相対で置く**（#1207）。
    // `passwordChangedAt` が無いトークンのベースラインは 0 ではなく
    // `issuedAt` なので、固定の過去日時を置くと「発行より前の変更」になり
    // 失効しない。ここで見たいのは「ログイン後に変更された」ケース
    const issuedAt = Date.now() - 60 * 60 * 1000;
    const changedAfterLogin = new Date(
      Date.now() - 30 * 60 * 1000,
    ).toISOString();

    setResolver(({ table, ops }) => {
      if (table === 'users' && ops.includes('select'))
        return {
          data: { password_changed_at: changedAfterLogin },
          error: null,
        };
      return { data: null, error: null };
    });

    const token = await jwt({
      token: {
        id: 'u1',
        issuedAt, // 絶対期限は未超過
        lastPasswordCheck: 0, // チェック間隔を必ず超過させて照合を走らせる
        lastLoginUpdate: Date.now(),
        passwordChangedAt: null, // トークン側は不明 → ベースラインは issuedAt
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

  /**
   * 同時に重なった確認を1回に畳む（#1281）
   *
   * 画面読み込みでクライアントが複数のAPIを同時に叩くと、全部が同じ（古い）
   * Cookie を持つので5分窓が一斉に切れ、同じ行を**本数ぶん**引いていた。
   * `lookupSessionUser` が束を畳む。
   */
  describe('確認の問い合わせの共有', () => {
    /** `users` への SELECT 回数を数えるトークンと resolver */
    function setupCounting() {
      let selects = 0;

      setResolver(({ table, ops }) => {
        if (table === 'users' && ops.includes('select')) {
          selects += 1;
          return {
            data: {
              password_hash: 'hash',
              password_changed_at: null,
              role: 'user',
            },
            error: null,
          };
        }
        return { data: null, error: null };
      });

      return () => selects;
    }

    const staleToken = (id: string) => ({
      id,
      role: 'user',
      issuedAt: Date.now(),
      lastPasswordCheck: 0,
      lastLoginUpdate: Date.now(),
      passwordChangedAt: null,
    });

    it('同じ利用者の確認が重なっても1回しか引かない', async () => {
      const selects = setupCounting();

      await Promise.all([
        jwt({ token: staleToken('u1'), user: undefined, account: null }),
        jwt({ token: staleToken('u1'), user: undefined, account: null }),
        jwt({ token: staleToken('u1'), user: undefined, account: null }),
      ]);

      expect(selects()).toBe(1);
    });

    it('利用者が違えばそれぞれ引く', async () => {
      const selects = setupCounting();

      await Promise.all([
        jwt({ token: staleToken('u1'), user: undefined, account: null }),
        jwt({ token: staleToken('u2'), user: undefined, account: null }),
      ]);

      expect(selects()).toBe(2);
    });

    // 畳んでも結果は全員に行き渡る。片方だけ失効し損ねると穴になる
    it('重なったぶんにも失効が伝わる', async () => {
      setResolver(({ table, ops }) =>
        table === 'users' && ops.includes('select')
          ? {
              data: {
                password_hash: 'hash',
                // トークン発行より後の変更 → 失効させる
                password_changed_at: new Date(Date.now() + 1_000).toISOString(),
                role: 'user',
              },
              error: null,
            }
          : { data: null, error: null },
      );

      const tokens = await Promise.all([
        jwt({ token: staleToken('u1'), user: undefined, account: null }),
        jwt({ token: staleToken('u1'), user: undefined, account: null }),
      ]);

      expect(tokens.map((t) => t.invalidated)).toEqual([true, true]);
    });
  });

  /**
   * 取得に失敗したときは確認を終えたことにしない（#1193）
   *
   * ⚠️ postgrest-js はネットワーク障害を **throw せず**
   * `{ data: null, error: { code: '' } }` を返す
   * （`PostgrestBuilder.ts` の `res.catch(...)`）。`error` を捨てると
   * 「取得に失敗した」と「行が無い」を区別できず、`lastPasswordCheck` を
   * 進めてしまう＝**パスワード変更による強制失効の確認が5分間
   * 静かにスキップされる**。
   */
  describe('パスワード変更チェックの取得失敗', () => {
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    /** 伝送路の失敗。postgrest-js は code を空で返す */
    const setFetchFailure = () => {
      setResolver(({ table, ops }) => {
        if (table === 'users' && ops.includes('select')) {
          return {
            data: null,
            error: {
              message: 'TypeError: fetch failed',
              details: '',
              hint: '',
              code: '',
            },
          };
        }
        return { data: null, error: null };
      });
    };

    /** 確認間隔を必ず超過させたトークン */
    const staleToken = () => ({
      id: 'u1',
      role: 'admin',
      issuedAt: Date.now(),
      lastPasswordCheck: 0,
      lastLoginUpdate: Date.now(),
      passwordChangedAt: null,
    });

    /** 次の確認が来るまでの残り時間（ミリ秒） */
    const dueIn = (token: Record<string, unknown>) =>
      (token.lastPasswordCheck as number) +
      SESSION_CONFIG.PASSWORD_CHECK_INTERVAL_MS -
      Date.now();

    it('取得に失敗したら確認を終えたことにしない', async () => {
      setFetchFailure();

      const token = await jwt({
        token: staleToken(),
        user: undefined,
        account: null,
      });

      // 5分も待たずに再確認が来る（＝失効の窓が5分にならない）
      expect(dueIn(token)).toBeLessThanOrEqual(
        SESSION_CONFIG.PASSWORD_CHECK_RETRY_MS,
      );
    });

    /**
     * ⚠️ 据え置き（`lastPasswordCheck` をそのまま）にはしない。
     *
     * 権限事故（`42501`）やスキーマキャッシュのような**恒久的な**失敗では、
     * 据え置くと毎リクエスト引き直して弱っているDBを押し続ける
     */
    it('毎リクエスト引き直しにはしない', async () => {
      setFetchFailure();

      const token = await jwt({
        token: staleToken(),
        user: undefined,
        account: null,
      });

      expect(dueIn(token)).toBeGreaterThan(0);
    });

    /**
     * ⚠️ `code` が空のときだけに狭めてはいけない。
     *
     * postgrest-js が `code: ''` を入れるのは**伝送路の失敗だけ**で、
     * PostgREST が返すエラーは実際のコードが入る。狭めると権限事故や
     * タイムアウトで #1193 が再発する
     */
    it.each([
      ['権限エラー', '42501'],
      ['タイムアウト', '57014'],
      ['スキーマキャッシュ', 'PGRST205'],
      ['非JSONのエラーボディ', undefined],
    ])('%s でも確認を終えたことにしない', async (_label, code) => {
      setResolver(({ table, ops }) => {
        if (table === 'users' && ops.includes('select')) {
          return {
            data: null,
            error: { message: 'failed', details: '', hint: '', code },
          };
        }
        return { data: null, error: null };
      });

      const token = await jwt({
        token: staleToken(),
        user: undefined,
        account: null,
      });

      expect(dueIn(token)).toBeLessThanOrEqual(
        SESSION_CONFIG.PASSWORD_CHECK_RETRY_MS,
      );
    });

    it('取得に失敗してもセッションは無効化しない', async () => {
      // DB の一時的な不調で全利用者をログアウトさせない
      setFetchFailure();

      const token = await jwt({
        token: staleToken(),
        user: undefined,
        account: null,
      });

      expect(token.invalidated).toBeUndefined();
    });

    /**
     * ⚠️ これは「安全側」の固定ではない。
     *
     * 取得できなかったので DB の値には追従しない＝**剥奪された admin が
     * 再確認まで admin のまま**になる。許容できるのは、サーバー側の
     * admin 認可が毎回 DB を引き直すから（`src/helpers/adminAuth.ts`）で、
     * トークンの `role` はメニュー表示の判定にしか使っていない
     */
    it('取得に失敗したらロールも追従させない（表示用の値なので許容する）', async () => {
      setFetchFailure();

      const token = await jwt({
        token: staleToken(),
        user: undefined,
        account: null,
      });

      expect(token.role).toBe('admin');
    });

    /**
     * Issue #1193 の完了条件「次の呼び出しで再確認が走る」の検証。
     *
     * 先送りしただけで終わらず、**時間が経てば実際に失効する**ところまで
     * 通して見る。ここが本件で唯一の end-to-end な回帰テスト
     */
    it('先送りしたあと、時間が経てば再確認して失効させる', async () => {
      // ⚠️ 変更日時は**発行より後**に置く（#1207）。`passwordChangedAt` が
      // 無いトークンのベースラインは 0 ではなく `issuedAt` なので、固定の
      // 過去日時だと「発行より前の変更」になり失効しない。
      // ここで見たいのは「障害の最中に変更された」ケース
      const issuedAt = Date.now() - 60 * 60 * 1000;
      const changedAfterLogin = new Date(
        Date.now() - 30 * 60 * 1000,
      ).toISOString();

      setFetchFailure();
      const afterFailure = await jwt({
        token: { ...staleToken(), issuedAt },
        user: undefined,
        account: null,
      });
      expect(afterFailure.invalidated).toBeUndefined();

      // DB が復旧し、パスワードはその間に変更されていた
      setResolver(({ table, ops }) => {
        if (table === 'users' && ops.includes('select')) {
          return {
            data: { password_changed_at: changedAfterLogin, role: 'user' },
            error: null,
          };
        }
        return { data: null, error: null };
      });

      // 再確認の時刻まで進める
      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockReturnValue(
          Date.now() + SESSION_CONFIG.PASSWORD_CHECK_RETRY_MS + 1000,
        );

      try {
        const recovered = await jwt({
          token: { ...afterFailure },
          user: undefined,
          account: null,
        });

        expect(recovered.invalidated).toBe(true);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('取得の失敗をログに残す', async () => {
      setFetchFailure();

      await jwt({ token: staleToken(), user: undefined, account: null });

      expect(errorSpy).toHaveBeenCalledWith(
        'Password change check failed:',
        expect.objectContaining({ code: '' }),
      );
    });

    /**
     * 0件（PGRST116）は「確定した答え」なので先送りしない。
     * 先送りすると、消えた行を毎リクエスト引き続けることになる
     */
    it('0件なら従来どおり確認を終えたことにする', async () => {
      setResolver(({ table, ops }) => {
        if (table === 'users' && ops.includes('select')) {
          return {
            data: null,
            error: {
              message: 'JSON object requested, multiple (or no) rows returned',
              details: '',
              hint: '',
              code: 'PGRST116',
            },
          };
        }
        return { data: null, error: null };
      });

      const token = await jwt({
        token: staleToken(),
        user: undefined,
        account: null,
      });

      expect(token.lastPasswordCheck).not.toBe(0);
      expect(token.invalidated).toBeUndefined();
    });
  });

  /**
   * OAuth 初回ログインの `users` 取得も `error` を捨てない（#1207）
   *
   * 定期チェック（#1193）と**同じバグ class**。こちらは
   * `lastPasswordCheck` をクエリより前に立てていたため、取得に失敗しても
   * 巻き戻らず、`passwordChangedAt: null` のトークンで 5分間の盲目窓ができた。
   *
   * ⚠️ 到達には `users` の select **だけ**を失敗させる必要がある。
   * 直後の `getSecondFactorMethod()` も DB を引くので、全テーブルを失敗させると
   * そちらが throw して `if (user) throw error`（#1148）でサインインごと
   * 失敗し、この分岐に用がなくなる
   */
  describe('OAuth 初回ログインの users 取得失敗', () => {
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    /** `users` の select だけを落とす（user_totp は正常に応答させる） */
    const setUsersSelectFailure = (code: string) => {
      setResolver(({ table, ops }) => {
        if (table === 'users' && ops.includes('select')) {
          return {
            data: null,
            error: {
              message: 'TypeError: fetch failed',
              details: '',
              hint: '',
              code,
            },
          };
        }
        return { data: null, error: null };
      });
    };

    const oauthSignIn = () =>
      jwt({
        token: {},
        user: { id: 'u1', email: 'a@example.com', name: 'A', image: null },
        account: { provider: 'google' },
      });

    /**
     * 確かめたいのは「5分間の盲目窓ができないこと」。
     *
     * 失敗時に `lastPasswordCheck` を立てないと、**同じ呼び出しの中で**
     * 下の定期チェックが（未設定＝0 扱いで）引き直し、そちらも失敗して
     * #1193 のガードが 10秒後の再試行値を入れる。結果として
     * `lastPasswordCheck` は非ゼロになるが、次の確認は 10秒後に来る。
     *
     * 修正前はクエリより前に `Date.now()` を立てていたため、定期チェックが
     * 間隔内と判断してスキップし、次の確認は**5分後**になっていた。
     * この差を見る
     */
    it('取得に失敗したら5分の盲目窓を作らない', async () => {
      setUsersSelectFailure('');

      const token = await oauthSignIn();

      const dueIn =
        (token.lastPasswordCheck as number) +
        SESSION_CONFIG.PASSWORD_CHECK_INTERVAL_MS -
        Date.now();

      expect(dueIn).toBeLessThanOrEqual(SESSION_CONFIG.PASSWORD_CHECK_RETRY_MS);
    });

    it('取得に失敗したことをログに残す', async () => {
      setUsersSelectFailure('');

      await oauthSignIn();

      expect(errorSpy).toHaveBeenCalledWith(
        'OAuth sign-in user lookup failed:',
        expect.objectContaining({ code: '' }),
      );
    });

    /**
     * 0件（PGRST116）は「確定した答え」。OAuth の初回は signIn コールバックが
     * 行を作った直後なので通常は起きないが、起きたとしても先送りする理由はない
     */
    it('0件なら確認を終えたことにする', async () => {
      setUsersSelectFailure('PGRST116');

      const token = await oauthSignIn();

      expect(token.lastPasswordCheck).toBeTruthy();
      expect(token.role).toBe('user');
      expect(token.passwordChangedAt).toBeNull();
    });

    /**
     * 取得に失敗したセッションを、DB 復旧と同時に失効させない（#1207）
     *
     * 失敗すると `passwordChangedAt` は `null` のまま残る。ベースラインを
     * 0 に倒していた頃は、次の確認が成功した時点で `dbChangedAt > 0` となり、
     * **パスワードは変更されていないのに失効していた**。
     * セッションはそのパスワード変更より後に発行されているので、
     * 発行時刻を基準にすれば失効しない
     */
    it('取得に失敗しても、過去のパスワード変更では失効しない', async () => {
      let call = 0;
      setResolver(({ table, ops }) => {
        if (table === 'users' && ops.includes('select')) {
          call += 1;
          // 1回目（OAuth 初回）は失敗、2回目（引き直し）は成功
          if (call === 1) {
            return {
              data: null,
              error: {
                message: 'TypeError: fetch failed',
                details: '',
                hint: '',
                code: '',
              },
            };
          }
          return {
            data: {
              role: 'user',
              password_hash: 'hashed',
              // サインインより前に行われた変更
              password_changed_at: new Date(Date.now() - 60_000).toISOString(),
            },
            error: null,
          };
        }
        return { data: null, error: null };
      });

      const token = await oauthSignIn();

      expect(token.invalidated).toBeUndefined();
    });

    /** 発行より後の変更は従来どおり失効させる（ガードを緩めすぎない） */
    it('発行より後のパスワード変更では失効する', async () => {
      // ⚠️ `oauthSignIn()` は `issuedAt` を「今」で押すため、「発行より後」を
      //   素直に表すと未来日時になる。本番の `password_changed_at` は書き込み時に
      //   必ず `new Date()` なので未来値は出ない。ここでは時計を進めて
      //   「発行のあとに変更された」を実際の時間順で作る
      let call = 0;
      setResolver(({ table, ops }) => {
        if (table === 'users' && ops.includes('select')) {
          call += 1;
          if (call === 1) {
            return {
              data: null,
              error: {
                message: 'TypeError: fetch failed',
                details: '',
                hint: '',
                code: '',
              },
            };
          }
          return {
            data: {
              role: 'user',
              password_hash: 'hashed',
              password_changed_at: new Date().toISOString(),
            },
            error: null,
          };
        }
        return { data: null, error: null };
      });

      const issuedBefore = Date.now() - 60 * 60 * 1000;
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(issuedBefore);
      let token;
      try {
        // サインインを1時間前として記録させる
        token = await oauthSignIn();
      } finally {
        nowSpy.mockRestore();
      }

      // 時計を戻したあとの確認で、発行より後の変更として比較される
      token = await jwt({ token, user: undefined, account: null });

      expect(token.invalidated).toBe(true);
    });

    it('取得できたときは従来どおり反映して lastPasswordCheck を立てる', async () => {
      setResolver(({ table, ops }) => {
        if (table === 'users' && ops.includes('select')) {
          return {
            data: {
              role: 'admin',
              password_hash: 'hashed',
              password_changed_at: '2026-01-01T00:00:00Z',
            },
            error: null,
          };
        }
        return { data: null, error: null };
      });

      const token = await oauthSignIn();

      expect(token.role).toBe('admin');
      expect(token.hasPassword).toBe(true);
      expect(token.passwordChangedAt).toBe('2026-01-01T00:00:00Z');
      expect(token.lastPasswordCheck).toBeTruthy();
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

  /**
   * 失効と「第2要素が未了」はどちらも `user.id` を空にするため、
   * **セッションだけ見ると区別がつかない**。区別しているのは
   * `session.totpPending` の有無で、それは上の2分岐の**順序**だけが
   * 担保している（invalidated が先に return する）。
   *
   * ここが入れ替わると、失効したセッションに `totpPending` が付き、
   * `proxy.ts` の除外（#1150 で足した `!isTotpPending`）に当たって
   * **Cookie が掃除されなくなる**。利用者は認証コード入力画面から
   * 出られないまま留まる。実装側に順序を促すコメントが無いので、
   * テストで固定しておく
   */
  it('invalidated が totpPending より優先される（失効セッションに totpPending を付けない）', async () => {
    const result = await session({
      session: { user: { id: 'u1', email: 'a@example.com' } },
      token: { invalidated: true, totpPending: true },
    });

    expect(result.user).toMatchObject({ id: '', email: '', role: '' });
    expect(result.totpPending).toBeUndefined();
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

  /**
   * ⚠️ 拒否するだけでなく **code を載せて** 投げる（#1254）
   *
   * プレーンな `Error` だと Auth.js が code を載せず
   * （`@auth/core/index.js:133`）、クライアントで
   * 「メールアドレスまたはパスワードが正しくありません」に丸められる。
   * 待てば直ることが伝わらず、打ち直すほど悪化する
   */
  it('送信元IP単位の制限を超えたら rate_limited を返す', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 900,
    });

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: 'pw' },
        makeRequest('203.0.113.1'),
      ),
    ).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('アカウント単位の制限を超えたら rate_limited を返す', async () => {
    // 1つ目（login_ip）は通し、2つ目（login）で落とす
    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfter: 1800 });

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: 'pw' },
        makeRequest('203.0.113.1'),
      ),
    ).rejects.toMatchObject({ code: 'rate_limited' });

    // 2層目で落としたことを確認（1層目と取り違えていない）
    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      'user@example.com|203.0.113.1',
      'login',
      5,
      30,
    );
  });

  it('アカウントが存在しなくても同じコードを返す（列挙防止）', async () => {
    // この判定は users を引く前なので、存在の有無で挙動が変わらない
    setResolver(() => ({ data: null, error: { code: 'PGRST116' } }));
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 900,
    });

    await expect(
      credentialsProvider.authorize(
        { email: 'nobody@example.com', password: 'pw' },
        makeRequest('203.0.113.1'),
      ),
    ).rejects.toMatchObject({ code: 'rate_limited' });
  });

  /**
   * ⚠️ レート制限の超過は `rate_limited` のコードで返す。
   *
   * プレーンな `Error` を投げると Auth.js が `code` を載せないため
   * （`authErrors.ts` 参照）、クライアントの `resolveErrorMessage` が
   * default に落ちて「メールアドレスまたはパスワードが正しくありません」と
   * 表示される。パスワードが正しくてもそう言われ続ける（#1247 と同じ形）。
   *
   * 識別子にIPが入り、パスワード照合より前に消費されるので、
   * `rate_limited` を返してもアカウント列挙にはならない。
   */
  it('送信元IP単位の超過は rate_limited のコードで返す', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfter: 900,
    });

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: 'pw' },
        makeRequest('203.0.113.1'),
      ),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODE.RATE_LIMITED });
  });

  it('アカウント×送信元単位の超過も rate_limited のコードで返す', async () => {
    // ⚠️ 1層目（login_ip）を明示的に通してから2層目を落とす。
    // mockResolvedValueOnce を1つだけ積むと1層目が消費してしまい、
    // 固定したい2層目を何も検証しないまま緑になる
    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfter: 1800 });

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: 'pw' },
        makeRequest('203.0.113.1'),
      ),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODE.RATE_LIMITED });

    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.anything(),
      'login',
      expect.anything(),
      expect.anything(),
    );
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
/**
 * 応答時間でアカウントの有無を判定させない（#1256）
 *
 * 照合相手が居ないとき bcrypt を回さずに即 return していたため、
 * 「存在しない: 1ms」「存在する: ~250ms」と分かれていた。メールアドレスの
 * 一覧を持つ相手が、登録済みのものを時間差で絞り込める
 */
describe('authorize のタイミング均一化', () => {
  let compareSpy: jest.SpyInstance;

  function makeRequest(): Request {
    return new Request('http://localhost/api/auth/callback/credentials', {
      headers: new Headers({ 'x-vercel-forwarded-for': '203.0.113.1' }),
    });
  }

  beforeEach(() => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    compareSpy = jest.spyOn(bcrypt, 'compare');
  });

  afterEach(() => {
    compareSpy.mockRestore();
  });

  it('ユーザーが存在しなくても bcrypt を回す', async () => {
    setResolver(() => ({ data: null, error: { code: 'PGRST116' } }));

    await credentialsProvider
      .authorize(
        { email: 'nobody@example.com', password: 'Password1' },
        makeRequest(),
      )
      .catch(() => undefined);

    expect(compareSpy).toHaveBeenCalledTimes(1);
    // 本物のハッシュとは比較しない（常に false になるダミー）
    expect(compareSpy.mock.calls[0][1]).toBe(DUMMY_PASSWORD_HASH);
  });

  it('パスワード未設定のユーザーでも bcrypt を回す', async () => {
    // 即 return すると「ソーシャル専用アカウントである」ことが時間で分かる
    setResolver(({ table }) =>
      table === 'users'
        ? {
            data: {
              id: 'user-1',
              email: 'social@example.com',
              name: 'Social',
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

    await credentialsProvider
      .authorize(
        { email: 'social@example.com', password: 'Password1' },
        makeRequest(),
      )
      .catch(() => undefined);

    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  it('OTP経路では回さない（照合するパスワードが無い）', async () => {
    setResolver(() => ({ data: null, error: { code: 'PGRST116' } }));

    await credentialsProvider
      .authorize(
        {
          email: 'nobody@example.com',
          loginMethod: 'otp',
          verificationToken: 'token',
        },
        makeRequest(),
      )
      .catch(() => undefined);

    expect(compareSpy).not.toHaveBeenCalled();
  });
});

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
    mockGetSecondFactorMethod.mockResolvedValue(null);

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: PASSWORD },
        makeRequest(),
      ),
    ).resolves.toMatchObject({ id: USER_ID });
    expect(mockVerifySecondFactor).not.toHaveBeenCalled();
  });

  it('二段階認証が有効でコード未入力なら totp_required を返す', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);

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
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: 'WrongPassword1' },
        makeRequest(),
      ),
    ).rejects.toThrow();
    expect(mockGetSecondFactorMethod).not.toHaveBeenCalled();
  });

  it('正しいコードならログインできる', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);
    mockVerifySecondFactor.mockResolvedValue('success');

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: PASSWORD, totpCode: '123456' },
        makeRequest(),
      ),
    ).resolves.toMatchObject({ id: USER_ID });
  });

  it('誤ったコードは totp_invalid を返す', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);
    mockVerifySecondFactor.mockResolvedValue('invalid');

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: PASSWORD, totpCode: '000000' },
        makeRequest(),
      ),
    ).rejects.toMatchObject({ code: 'totp_invalid' });
  });

  it('使い回したコードは totp_reused を返す', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);
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
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);
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
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);
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
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);

    await expect(
      credentialsProvider.authorize(
        { email: 'user@example.com', password: PASSWORD, totpCode: '   ' },
        makeRequest(),
      ),
    ).rejects.toMatchObject({ code: 'totp_required' });
  });

  /**
   * メール認証が未完了のアカウント（#1247）
   *
   * 登録して確認コードを入れる前に画面を離れた人がここへ来る。以前は
   * プレーンな `Error` を投げていたため `code` が載らず、画面には
   * 「メールアドレスまたはパスワードが正しくありません」としか出なかった。
   * **パスワードは正しい**ので、何度打ち直しても通らない
   */
  describe('メール未認証', () => {
    const unverified = () =>
      setResolver(({ table }) =>
        table === 'users'
          ? {
              data: {
                id: USER_ID,
                email: 'user@example.com',
                name: 'User',
                avatar_url: null,
                role: 'user',
                is_verified: false,
                password_hash: PASSWORD_HASH,
                password_changed_at: null,
              },
              error: null,
            }
          : { data: null, error: null },
      );

    it('パスワードが正しければ email_not_verified を返す', async () => {
      unverified();
      mockGetSecondFactorMethod.mockResolvedValue(null);

      await expect(
        credentialsProvider.authorize(
          { email: 'user@example.com', password: PASSWORD },
          makeRequest(),
        ),
      ).rejects.toMatchObject({ code: 'email_not_verified' });
    });

    /**
     * ⚠️ 列挙対策。これが崩れると、パスワードを知らない相手に
     * 「このメールアドレスは登録済み」が分かる
     */
    it('パスワードが誤っていれば理由を明かさない', async () => {
      unverified();
      mockGetSecondFactorMethod.mockResolvedValue(null);

      await expect(
        credentialsProvider.authorize(
          { email: 'user@example.com', password: 'WrongPassword1' },
          makeRequest(),
        ),
      ).rejects.not.toMatchObject({ code: 'email_not_verified' });
    });

    it('第2要素の有無は問い合わせない', async () => {
      // 未認証の時点で弾くので、二段階認証を使っているかどうかも漏らさない
      unverified();
      mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);

      await expect(
        credentialsProvider.authorize(
          { email: 'user@example.com', password: PASSWORD },
          makeRequest(),
        ),
      ).rejects.toMatchObject({ code: 'email_not_verified' });
      expect(mockGetSecondFactorMethod).not.toHaveBeenCalled();
    });

    it('認証済みなら通常どおりログインできる', async () => {
      mockGetSecondFactorMethod.mockResolvedValue(null);

      await expect(
        credentialsProvider.authorize(
          { email: 'user@example.com', password: PASSWORD },
          makeRequest(),
        ),
      ).resolves.toMatchObject({ id: USER_ID });
    });
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

  /**
   * ⚠️ **有効な検証済みトークンを与える**（#1255）
   *
   * 以前はトークンが無くても `otp_login_disabled` が返っていた。
   * つまりメールアドレスを知っているだけで「登録済み＋二段階認証あり」を
   * 引けた。判定をトークン検証の後ろへ移したので、ここも正規の経路を通す
   */
  it('二段階認証が有効ならメールOTP単独ログインを拒否する', async () => {
    // メールのコードだけで入れる経路は第2要素ではなくパスワードの代替であり、
    // 残すと最も弱い経路が全体の強度を決めてしまう（#642）
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);
    setResolver(({ table }) => {
      if (table === 'users') {
        return {
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
        };
      }
      if (table === 'otp_codes') {
        return {
          data: {
            id: 'otp-1',
            email: 'user@example.com',
            verified_at: new Date().toISOString(),
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

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

  it('二段階認証で弾くときも検証済みトークンを消費しない', async () => {
    // 焼いてしまうと、パスワード経路へ切り替えるにもコードを取り直すことになる
    // （#1235 と同じ形）
    const deleted: string[] = [];
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);
    setResolver(({ table, ops }) => {
      if (table === 'users') {
        return {
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
        };
      }
      if (table === 'otp_codes') {
        if (ops.includes('delete')) {
          deleted.push('otp_codes');
          return { data: null, error: null };
        }
        return {
          data: {
            id: 'otp-1',
            email: 'user@example.com',
            verified_at: new Date().toISOString(),
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    await credentialsProvider
      .authorize(
        {
          email: 'user@example.com',
          loginMethod: 'otp',
          verificationToken: 'token',
        },
        makeRequest(),
      )
      .catch(() => undefined);

    expect(deleted).not.toContain('otp_codes');
  });

  /**
   * ⚠️ 列挙対策（#1255）
   *
   * トークンが無ければ、二段階認証の有無を明かさない
   */
  it('検証済みトークンが無ければ二段階認証の有無を明かさない', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);

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
    // そもそも問い合わせない
    expect(mockGetSecondFactorMethod).not.toHaveBeenCalled();
  });

  it('二段階認証が無効ならメールOTP経路は従来どおり進む', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(null);

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

  /**
   * 通したときは検証済みトークンを消費する（ワンタイム）
   *
   * ⚠️ 下の「弾くときは消費しない」と**対で必要**。片方だけだと、
   * 消費そのものを消しても全部グリーンで通る（実際そうなっていた）。
   * トークンは `verified_at` から5分有効なので、残ると使い回せる
   */
  it('ログインに成功したら検証済みトークンを消費する', async () => {
    const deleted: string[] = [];
    mockGetSecondFactorMethod.mockResolvedValue(null);

    setResolver(({ table, ops }) => {
      if (table === 'users') {
        return {
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
        };
      }

      if (table === 'otp_codes') {
        if (ops.includes('delete')) {
          deleted.push('otp_codes');
          return { data: null, error: null };
        }

        return {
          data: {
            id: 'otp-1',
            email: 'user@example.com',
            verified_at: new Date().toISOString(),
          },
          error: null,
        };
      }

      return { data: null, error: null };
    });

    await expect(
      credentialsProvider.authorize(
        {
          email: 'user@example.com',
          loginMethod: 'otp',
          verificationToken: 'token',
        },
        makeRequest(),
      ),
    ).resolves.toMatchObject({ id: 'user-1' });

    expect(deleted).toContain('otp_codes');
  });

  /**
   * メール認証が未完了のアカウント（#1247）
   *
   * この画面には**パスワード欄すら無い**のに「メールアドレスまたは
   * パスワードが正しくありません」と出ていた。コードは正しいのに
   */
  describe('メール未認証', () => {
    /** 未認証ユーザー + 有効な検証済みトークンを返す */
    const setup = (deleted: string[]) =>
      setResolver(({ table, ops }) => {
        if (table === 'users') {
          return {
            data: {
              id: 'user-1',
              email: 'user@example.com',
              name: 'User',
              avatar_url: null,
              role: 'user',
              is_verified: false,
              password_hash: null,
              password_changed_at: null,
            },
            error: null,
          };
        }

        if (table === 'otp_codes') {
          if (ops.includes('delete')) {
            deleted.push('otp_codes');
            return { data: null, error: null };
          }

          return {
            data: {
              id: 'otp-1',
              email: 'user@example.com',
              verified_at: new Date().toISOString(),
            },
            error: null,
          };
        }

        return { data: null, error: null };
      });

    it('コードが正しければ email_not_verified を返す', async () => {
      const deleted: string[] = [];
      setup(deleted);
      mockGetSecondFactorMethod.mockResolvedValue(null);

      await expect(
        credentialsProvider.authorize(
          {
            email: 'user@example.com',
            loginMethod: 'otp',
            verificationToken: 'token',
          },
          makeRequest(),
        ),
      ).rejects.toMatchObject({ code: 'email_not_verified' });
    });

    /**
     * ⚠️ 弾くのはトークンを消費する前。後ろに置くと、理由を伝えた時点で
     * トークンが焼けており、やり直すにもコードを取り直すことになる
     * （#1235 と同じ形）
     */
    it('弾くときに検証済みトークンを消費しない', async () => {
      const deleted: string[] = [];
      setup(deleted);
      mockGetSecondFactorMethod.mockResolvedValue(null);

      await credentialsProvider
        .authorize(
          {
            email: 'user@example.com',
            loginMethod: 'otp',
            verificationToken: 'token',
          },
          makeRequest(),
        )
        .catch(() => undefined);

      expect(deleted).not.toContain('otp_codes');
    });

    /**
     * ⚠️ 列挙対策。トークンが無効なら、未認証かどうかを明かさない
     */
    it('トークンが無効なら理由を明かさない', async () => {
      setResolver(({ table }) =>
        table === 'users'
          ? {
              data: {
                id: 'user-1',
                email: 'user@example.com',
                name: 'User',
                avatar_url: null,
                role: 'user',
                is_verified: false,
                password_hash: null,
                password_changed_at: null,
              },
              error: null,
            }
          : { data: null, error: null },
      );
      mockGetSecondFactorMethod.mockResolvedValue(null);

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

      expect((error as { code?: string }).code).not.toBe('email_not_verified');
    });
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
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);
    setResolver(() => ({ data: { role: 'user' }, error: null }));

    const token = await jwt({
      token: {},
      user: { id: 'u1', email: 'a@example.com', name: 'A', image: null },
      account: { provider: 'google' },
    });

    expect(token.totpPending).toBe(true);
  });

  it('OAuth初回で二段階認証が無効なら totpPending は立たない', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(null);
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

  /**
   * ⚠️ ここで throw するとセッションが壊れる
   *
   * `@auth/core/lib/actions/session.js` は jwt コールバックの例外を
   * **すべて**捕まえて `sessionStore.clean()` でセッションCookieを削除する
   * （「JWT が検証できない」ケースを想定した後始末だが、例外の種類を見ない）。
   *
   * Cookie が消えると認証コード画面は「正しくありません」を出し続け、
   * 利用者は OAuth ログインからやり直すしかなくなる。第2要素は通さずに、
   * セッションだけは残す
   */
  it('検証が DB エラーで落ちても、例外を外へ出さず totpPending を残す', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mockVerifySecondFactor.mockRejectedValue(
        new Error('connection terminated unexpectedly'),
      );

      const token = await jwt({
        token: { id: 'u1', totpPending: true, issuedAt: Date.now() },
        user: undefined,
        account: null,
        trigger: 'update',
        session: { totpCode: '123456' },
      });

      expect(token.totpPending).toBe(true);
    } finally {
      error.mockRestore();
    }
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

/**
 * jwt コールバックから例外を出さない（#1148）
 *
 * `@auth/core/lib/actions/session.js` は jwt コールバックの例外を**すべて**
 * 捕まえて `sessionStore.clean()` でセッションCookieを削除する。
 * PR #1146 で `verifySecondFactor` だけは囲んだが、**同じコールバック内の
 * 他の処理**（レート制限の判定・パスワード変更チェック・last_login_at 更新）は
 * 素通りしていた。
 *
 * Cookie が消えると認証コード画面は「正しくありません」を出し続け、
 * 利用者は OAuth ログインからやり直すしかなくなる。
 *
 * ⚠️ **本当に JWT が壊れている場合はここへ来ない。** `jwt.decode()` の失敗は
 * `callbacks.jwt` を呼ぶ前に同じ try の中で投げられる（session.js:24）ため、
 * そちらは従来どおり Cookie が消える。
 */
describe('jwt コールバックの例外', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockResetRateLimit.mockReset();
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  /** 第2要素が未了のトークンで update する */
  const updateWithCode = (code = '123456') =>
    jwt({
      token: { id: 'u1', totpPending: true, issuedAt: Date.now() },
      user: undefined,
      account: null,
      trigger: 'update',
      session: { totpCode: code },
    });

  // 完了条件（#1148）: checkRateLimit が throw しても totpPending が残ること
  it('レート制限の判定が落ちても例外を外へ出さず totpPending を残す', async () => {
    mockCheckRateLimit.mockRejectedValue(new Error('connection terminated'));

    const token = await updateWithCode();

    expect(token.totpPending).toBe(true);
  });

  it('レート制限の判定が落ちたら検証できなかったと伝える', async () => {
    mockCheckRateLimit.mockRejectedValue(new Error('connection terminated'));

    const token = await updateWithCode();

    expect(token.totpUnavailable).toBe(true);
  });

  it('検証が DB エラーで落ちたら検証できなかったと伝える', async () => {
    // コードの正誤とは別物。画面の文言を分けるために区別する
    mockVerifySecondFactor.mockRejectedValue(new Error('decrypt failed'));

    const token = await updateWithCode();

    expect(token.totpPending).toBe(true);
    expect(token.totpUnavailable).toBe(true);
  });

  it('誤ったコードは「検証できなかった」にしない', async () => {
    mockVerifySecondFactor.mockResolvedValue('invalid');

    const token = await updateWithCode('000000');

    expect(token.totpPending).toBe(true);
    expect(token.totpUnavailable).toBeUndefined();
  });

  /**
   * 復旧したら消えること。
   *
   * 残ると「一時的に確認できません」が出続け、今度はそちらで詰む
   */
  it('次の呼び出しで前回の失敗を引きずらない', async () => {
    mockVerifySecondFactor.mockRejectedValueOnce(new Error('decrypt failed'));
    const failed = await updateWithCode();
    expect(failed.totpUnavailable).toBe(true);

    mockVerifySecondFactor.mockResolvedValue('success');
    const recovered = await jwt({
      token: { ...failed },
      user: undefined,
      account: null,
      trigger: 'update',
      session: { totpCode: '123456' },
    });

    expect(recovered.totpPending).toBe(false);
    expect(recovered.totpUnavailable).toBeUndefined();
  });

  // 第2要素とは無関係な経路。ここで throw してもセッションは壊さない
  it('パスワード変更チェックが落ちても例外を外へ出さない', async () => {
    setResolver(() => {
      throw new Error('connection terminated');
    });

    const token = await jwt({
      token: {
        id: 'u1',
        totpPending: false,
        issuedAt: Date.now(),
        // 確認間隔（5分）を越えさせる
        lastPasswordCheck: 0,
      },
      user: undefined,
      account: null,
    });

    expect(token.id).toBe('u1');
  });

  // 握り潰しても調査できるよう、記録は残す
  it('例外をログに残す', async () => {
    mockCheckRateLimit.mockRejectedValue(new Error('connection terminated'));

    await updateWithCode();

    expect(errorSpy).toHaveBeenCalledWith(
      'JWT callback failed:',
      expect.any(Error),
    );
  });

  /**
   * ⚠️⚠️ **初回サインインは握り潰してはいけない**
   *
   * この分岐では `token.totpPending` の既定が false で、`getSecondFactorMethod()` の
   * 結果を待って初めて true になる。`getSecondFactorMethod` は DB エラーで
   * **意図的に throw する**（`secondFactor.ts`。false に倒すと第2要素が
   * 丸ごと飛ぶため）。
   *
   * 握り潰すと `totpPending: false` のトークンが返り、`@auth/core` が
   * そのまま署名して Cookie を発行する。**二段階認証を有効にしている
   * OAuth 利用者が、コードを一度も入れずに7日間有効なセッションを得る。**
   *
   * `signIn` コールバックは `users` / `accounts` しか触らないため、
   * `user_totp` に限局した障害ではここだけが落ちる＝現実に起こりうる。
   */
  describe('初回サインイン', () => {
    /** OAuth 初回サインインの jwt 呼び出し */
    const oauthSignIn = () =>
      jwt({
        token: {},
        user: { id: 'u1', email: 'a@example.com', name: 'A', image: null },
        account: { provider: 'google' },
      });

    it('二段階認証の判定が落ちたら例外を外へ出す（セッションを発行させない）', async () => {
      setResolver(() => ({ data: { role: 'user' }, error: null }));
      mockGetSecondFactorMethod.mockRejectedValue(
        new Error('read user_totp failed'),
      );

      await expect(oauthSignIn()).rejects.toThrow('read user_totp failed');
    });

    it('二段階認証の判定が落ちたとき totpPending が false のトークンを返さない', async () => {
      setResolver(() => ({ data: { role: 'user' }, error: null }));
      mockGetSecondFactorMethod.mockRejectedValue(
        new Error('read user_totp failed'),
      );

      // resolve してしまったら、その中身に関わらず fail-open
      await expect(oauthSignIn()).rejects.toBeDefined();
    });

    it('ユーザー情報の取得が落ちても例外を外へ出す', async () => {
      setResolver(() => {
        throw new Error('connection terminated');
      });

      await expect(oauthSignIn()).rejects.toThrow('connection terminated');
    });

    // 対照: 既存セッションの更新経路は従来どおり握り潰す（#1148 の本題）
    it('既存セッションの更新では握り潰す', async () => {
      mockCheckRateLimit.mockRejectedValue(new Error('connection terminated'));

      const token = await updateWithCode();

      expect(token.totpPending).toBe(true);
    });
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

// -------------------- 第2要素がメールOTP（パスワード経路） --------------------

describe('authorize の第2要素（method=email_otp）', () => {
  const PASSWORD = 'Password1';
  const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
  const USER_ID = 'user-1';

  function makeRequest(): Request {
    return new Request('http://localhost/api/auth/callback/credentials', {
      headers: new Headers({ 'x-vercel-forwarded-for': '203.0.113.1' }),
    });
  }

  /** users の1行を差し替える */
  const setUser = (overrides: Record<string, unknown> = {}) => {
    setResolver(({ table }) =>
      table === 'users'
        ? {
            data: {
              id: USER_ID,
              email: 'owner@example.com',
              name: 'User',
              avatar_url: null,
              role: 'user',
              is_verified: true,
              password_hash: PASSWORD_HASH,
              password_changed_at: null,
              ...overrides,
            },
            error: null,
          }
        : { data: null, error: null },
    );
  };

  beforeEach(() => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockResetRateLimit.mockReset();
    mockVerifySecondFactor.mockReset();
    mockSendSecondFactorCode.mockReset();
    mockSendSecondFactorCode.mockResolvedValue('sent');
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.EMAIL_OTP);
    setUser();
  });

  it('コード未入力なら email_otp_required を返し、コードを送る', async () => {
    await expect(
      credentialsProvider.authorize(
        { email: 'owner@example.com', password: PASSWORD },
        makeRequest(),
      ),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODE.EMAIL_OTP_REQUIRED });

    expect(mockSendSecondFactorCode).toHaveBeenCalled();
  });

  it('method=totp ではメールを送らない', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);

    await expect(
      credentialsProvider.authorize(
        { email: 'owner@example.com', password: PASSWORD },
        makeRequest(),
      ),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODE.TOTP_REQUIRED });

    expect(mockSendSecondFactorCode).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ 宛先は `user.email`。`authorize` スコープの `email` ローカル変数は
   * ユーザー名ログインで空文字になり（`isEmailLogin ? ... : ''`）、
   * 全ユーザー名アカウントが `otp_codes.email = ''` の1行を共有して
   * コードが混線する。再送間隔も送信上限も1つに潰れる。
   */
  it('ユーザー名ログインでも user.email を宛先にする', async () => {
    setUser({ username: 'alice' });

    await expect(
      credentialsProvider.authorize(
        { email: 'alice', password: PASSWORD },
        makeRequest(),
      ),
    ).rejects.toThrow();

    expect(mockSendSecondFactorCode).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      'owner@example.com',
    );
  });

  /**
   * 「コードが違う」と区別する。打ち直しても直らないので、同じ文言だと
   * 利用者は正しいコードを繰り返し打ち続ける（#1148 と同じ理由）。
   */
  it('送信に失敗したら second_factor_send_failed を返す', async () => {
    mockSendSecondFactorCode.mockResolvedValue('send_failed');

    await expect(
      credentialsProvider.authorize(
        { email: 'owner@example.com', password: PASSWORD },
        makeRequest(),
      ),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODE.SECOND_FACTOR_SEND_FAILED,
    });
  });

  /**
   * ⚠️ 1通も送っていないので「メールに送ったコードを入力してください」と
   * 出してはいけない。届かないコードを待たせることになる。
   * この状態の出口はリカバリーコードだけ。
   */
  it('送信上限なら second_factor_send_limited を返す', async () => {
    mockSendSecondFactorCode.mockResolvedValue('limit_exceeded');

    await expect(
      credentialsProvider.authorize(
        { email: 'owner@example.com', password: PASSWORD },
        makeRequest(),
      ),
    ).rejects.toMatchObject({
      code: AUTH_ERROR_CODE.SECOND_FACTOR_SEND_LIMITED,
    });
  });

  it('再送間隔に当たった場合は入力欄を出す（直前のコードが生きている）', async () => {
    mockSendSecondFactorCode.mockResolvedValue('throttled');

    await expect(
      credentialsProvider.authorize(
        { email: 'owner@example.com', password: PASSWORD },
        makeRequest(),
      ),
    ).rejects.toMatchObject({ code: AUTH_ERROR_CODE.EMAIL_OTP_REQUIRED });
  });

  /**
   * ⚠️ `login` の消費はそのまま残し、ここで解放する。
   *
   * 「コード未入力のときは消費しない」にすると判定がパスワード照合より後ろへ
   * 動き、**アカウント単位の5回/30分が消滅する**（パスワードが違う
   * リクエストは照合で先に throw されて枠を一度も消費しない）。
   * 残るのは LOGIN_IP だけで、しかも clientIp が unknown なら丸ごと
   * スキップされる。IP を変えれば総当たりが実質無制限になる。
   *
   * ここへ到達する＝パスワードは正しい。解放してもパスワードを知らない
   * 相手には枠が減ったまま残る。
   */
  it('第2要素を要求するときは login 枠を解放する', async () => {
    await expect(
      credentialsProvider.authorize(
        { email: 'owner@example.com', password: PASSWORD },
        makeRequest(),
      ),
    ).rejects.toThrow();

    // 消費はしている
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'login',
      expect.anything(),
      expect.anything(),
    );
    // そのうえで解放している
    expect(mockResetRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'login',
    );
  });

  it('パスワードが違うときは login 枠を解放しない', async () => {
    await expect(
      credentialsProvider.authorize(
        { email: 'owner@example.com', password: 'WrongPassword1' },
        makeRequest(),
      ),
    ).rejects.toThrow();

    expect(mockResetRateLimit).not.toHaveBeenCalled();
  });

  it('正しいコードならログインできる', async () => {
    mockVerifySecondFactor.mockResolvedValue('success');

    await expect(
      credentialsProvider.authorize(
        {
          email: 'owner@example.com',
          password: PASSWORD,
          totpCode: '123456',
        },
        makeRequest(),
      ),
    ).resolves.toMatchObject({ id: USER_ID });

    // コードが来ているときは送り直さない
    expect(mockSendSecondFactorCode).not.toHaveBeenCalled();
  });
});

// -------------------- OAuth 経路の第2要素（方式対応） --------------------

describe('jwt / session の第2要素（OAuth 経路）', () => {
  const USER_ID = 'user-1';

  beforeEach(() => {
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockResetRateLimit.mockReset();
    mockSendSecondFactorCode.mockReset();
    mockSendSecondFactorCode.mockResolvedValue('sent');
    mockVerifySecondFactor.mockReset();
    setResolver(({ table }) =>
      table === 'users'
        ? {
            data: {
              id: USER_ID,
              email: 'owner@example.com',
              role: 'user',
              password_hash: null,
              password_changed_at: null,
            },
            error: null,
          }
        : { data: null, error: null },
    );
  });

  it('method=email_otp なら totpPending を立ててコードを送る', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.EMAIL_OTP);

    const token = await jwt({
      token: {},
      user: { id: USER_ID, email: 'owner@example.com' },
      account: { provider: 'google' },
    });

    expect(token.totpPending).toBe(true);
    expect(token.secondFactorMethod).toBe(SECOND_FACTOR_METHOD.EMAIL_OTP);
    expect(mockSendSecondFactorCode).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      'owner@example.com',
    );
  });

  it('method=totp ではコードを送らない', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.TOTP);

    const token = await jwt({
      token: {},
      user: { id: USER_ID, email: 'owner@example.com' },
      account: { provider: 'google' },
    });

    expect(token.totpPending).toBe(true);
    expect(token.secondFactorMethod).toBe(SECOND_FACTOR_METHOD.TOTP);
    expect(mockSendSecondFactorCode).not.toHaveBeenCalled();
  });

  it('二段階認証が無効なら totpPending を立てない', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(null);

    const token = await jwt({
      token: {},
      user: { id: USER_ID, email: 'owner@example.com' },
      account: { provider: 'google' },
    });

    expect(token.totpPending).toBe(false);
    expect(mockSendSecondFactorCode).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ `jwt` コールバックからは例外を出せない（#1148）。
   * 送信の失敗はトークンのフラグで画面へ伝える。
   */
  it('送信に失敗したらフラグを立てる', async () => {
    mockGetSecondFactorMethod.mockResolvedValue(SECOND_FACTOR_METHOD.EMAIL_OTP);
    mockSendSecondFactorCode.mockResolvedValue('send_failed');

    const token = await jwt({
      token: {},
      user: { id: USER_ID, email: 'owner@example.com' },
      account: { provider: 'google' },
    });

    expect(token.secondFactorSendFailed).toBe(true);
  });

  /**
   * ⚠️ `:586` が `totpUnavailable` を消しているのと同じ理由。
   * 消さないと「送信できませんでした」が画面に出続ける。
   */
  it('再送に成功したら前回の失敗フラグが消える', async () => {
    const token = await jwt({
      token: {
        id: USER_ID,
        totpPending: true,
        secondFactorMethod: SECOND_FACTOR_METHOD.EMAIL_OTP,
        secondFactorSendFailed: true,
      },
      trigger: 'update',
      session: { resend: true },
    });

    expect(token.secondFactorSendFailed).toBeUndefined();
    expect(mockSendSecondFactorCode).toHaveBeenCalled();
  });

  it('update({ resend: true }) は totpPending を維持する', async () => {
    const token = await jwt({
      token: {
        id: USER_ID,
        totpPending: true,
        secondFactorMethod: SECOND_FACTOR_METHOD.EMAIL_OTP,
      },
      trigger: 'update',
      session: { resend: true },
    });

    expect(token.totpPending).toBe(true);
  });

  it('method=totp では resend を無視する', async () => {
    const token = await jwt({
      token: {
        id: USER_ID,
        totpPending: true,
        secondFactorMethod: SECOND_FACTOR_METHOD.TOTP,
      },
      trigger: 'update',
      session: { resend: true },
    });

    expect(token.totpPending).toBe(true);
    expect(mockSendSecondFactorCode).not.toHaveBeenCalled();
  });

  it('session に方式を載せる（画面が出し分けるため）', async () => {
    const result = await session({
      session: { user: {}, expires: '' },
      token: {
        id: USER_ID,
        totpPending: true,
        secondFactorMethod: SECOND_FACTOR_METHOD.EMAIL_OTP,
      },
    });

    expect(result.secondFactorMethod).toBe(SECOND_FACTOR_METHOD.EMAIL_OTP);
    // 第2要素が未了なのでユーザー情報は空のまま
    expect((result.user as { id: string }).id).toBe('');
  });

  it('session に送信失敗のフラグを載せる', async () => {
    const result = await session({
      session: { user: {}, expires: '' },
      token: {
        id: USER_ID,
        totpPending: true,
        secondFactorMethod: SECOND_FACTOR_METHOD.EMAIL_OTP,
        secondFactorSendFailed: true,
      },
    });

    expect(result.secondFactorSendFailed).toBe(true);
  });
});
