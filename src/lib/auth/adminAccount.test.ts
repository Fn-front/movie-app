/**
 * @jest-environment node
 */

/**
 * 管理者発行アカウントの作成・再発行 テスト
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createIssuedAccount,
  findReissuableAccount,
  listIssuedAccounts,
  recordReissueAudit,
} from './adminAccount';

/** 記録された操作 */
interface Capture {
  inserts: Array<{ table: string; payload: Record<string, unknown> }>;
  filters: Array<{ table: string; method: string; args: unknown[] }>;
}

/**
 * テーブルごとに返す値を指定できる Supabase モックを作る
 */
function createSupabase(options: {
  users?: { data?: unknown; error?: unknown };
  auditError?: unknown;
}) {
  const capture: Capture = { inserts: [], filters: [] };

  const from = jest.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    const chain = (method: string) =>
      jest.fn((...args: unknown[]) => {
        capture.filters.push({ table, method, args });
        return builder;
      });

    for (const m of ['select', 'eq', 'not', 'order', 'limit']) {
      builder[m] = chain(m);
    }

    builder.insert = jest.fn((payload: Record<string, unknown>) => {
      capture.inserts.push({ table, payload });
      return {
        select: () => ({
          single: () =>
            Promise.resolve(
              options.users ?? { data: { id: 'new-user' }, error: null },
            ),
        }),
        // admin_audit_logs は select を挟まず await される
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ error: options.auditError ?? null }).then(resolve),
      };
    });

    builder.single = () => Promise.resolve(options.users ?? { data: null });
    builder.maybeSingle = () =>
      Promise.resolve(options.users ?? { data: null });
    (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(options.users ?? { data: [], error: null }).then(resolve);

    return builder;
  });

  return { supabase: { from } as unknown as SupabaseClient, capture };
}

describe('listIssuedAccounts', () => {
  it('username を持つ行だけを対象にする', async () => {
    const { supabase, capture } = createSupabase({
      users: { data: [], error: null },
    });

    await listIssuedAccounts(supabase, 50);

    // メールで登録した通常のユーザーを admin が一覧できる必要はない
    expect(capture.filters).toContainEqual({
      table: 'users',
      method: 'not',
      args: ['username', 'is', null],
    });
  });

  it('パスワード未設定かどうかを返す（リンク未使用の判別）', async () => {
    const { supabase } = createSupabase({
      users: {
        data: [
          {
            id: 'u1',
            username: 'K7M2QXPT9WFN',
            created_at: '2026-10-30T00:00:00Z',
            last_login_at: null,
            password_hash: null,
          },
          {
            id: 'u2',
            username: 'ABCDEFGHJKMN',
            created_at: '2026-10-29T00:00:00Z',
            last_login_at: '2026-10-30T01:00:00Z',
            password_hash: 'hashed',
          },
        ],
        error: null,
      },
    });

    const accounts = await listIssuedAccounts(supabase, 50);

    expect(accounts[0].hasPassword).toBe(false);
    expect(accounts[1].hasPassword).toBe(true);
  });

  // password_hash をそのまま外へ出すと、ハッシュが管理画面のレスポンスに乗る
  it('password_hash を返さない', async () => {
    const { supabase } = createSupabase({
      users: {
        data: [
          {
            id: 'u1',
            username: 'K7M2QXPT9WFN',
            created_at: '2026-10-30T00:00:00Z',
            last_login_at: null,
            password_hash: 'secret-hash',
          },
        ],
        error: null,
      },
    });

    const accounts = await listIssuedAccounts(supabase, 50);

    expect(JSON.stringify(accounts)).not.toContain('secret-hash');
  });

  it('エラーはそのまま投げる', async () => {
    const { supabase } = createSupabase({
      users: { data: null, error: { message: 'boom' } },
    });

    await expect(listIssuedAccounts(supabase, 50)).rejects.toBeDefined();
  });
});

describe('createIssuedAccount', () => {
  it('password_hash は null で作る（本人が設定リンクから決める）', async () => {
    const { supabase, capture } = createSupabase({});

    await createIssuedAccount(supabase, 'admin-1');

    const insert = capture.inserts.find((i) => i.table === 'users');
    expect(insert?.payload.password_hash).toBeNull();
  });

  // authorize が「メール未確認」を弾くため。admin が発行した時点で
  // 本人確認済みとみなす
  it('is_verified は true で作る', async () => {
    const { supabase, capture } = createSupabase({});

    await createIssuedAccount(supabase, 'admin-1');

    const insert = capture.inserts.find((i) => i.table === 'users');
    expect(insert?.payload.is_verified).toBe(true);
  });

  it('合成メールアドレスは .invalid を使う', async () => {
    const { supabase, capture } = createSupabase({});

    await createIssuedAccount(supabase, 'admin-1');

    const insert = capture.inserts.find((i) => i.table === 'users');
    expect(insert?.payload.email).toMatch(/\.invalid$/);
  });

  it('ロールは user で作る（admin を増やさない）', async () => {
    const { supabase, capture } = createSupabase({});

    await createIssuedAccount(supabase, 'admin-1');

    const insert = capture.inserts.find((i) => i.table === 'users');
    expect(insert?.payload.role).toBe('user');
  });

  it('正規化済みのユーザー名を保存し、同じ値を返す', async () => {
    const { supabase, capture } = createSupabase({});

    const { username } = await createIssuedAccount(supabase, 'admin-1');

    const insert = capture.inserts.find((i) => i.table === 'users');
    expect(insert?.payload.username).toBe(username);
    // 区切りを含まない正規化済みの形で保存する
    expect(username).not.toContain('-');
  });

  it('監査ログを記録する（宛先メールは含めない）', async () => {
    const { supabase, capture } = createSupabase({});

    await createIssuedAccount(supabase, 'admin-1');

    const audit = capture.inserts.find(
      (i) => i.table === 'admin_audit_logs',
    )?.payload;

    expect(audit).toMatchObject({
      actor_user_id: 'admin-1',
      target_user_id: 'new-user',
      action: 'account_create',
    });
    expect(JSON.stringify(audit)).not.toContain('@');
  });

  it('作成に失敗したら投げる', async () => {
    const { supabase } = createSupabase({
      users: { data: null, error: { message: 'boom' } },
    });

    await expect(
      createIssuedAccount(supabase, 'admin-1'),
    ).rejects.toBeDefined();
  });

  // 記録のために機能を落とすと「記録できないときは発行もできない」という
  // 別の運用リスクが生まれる。代わりに必ずログへ出す
  it('監査ログの記録に失敗しても発行は続行し、ログに出す', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { supabase } = createSupabase({ auditError: { message: 'boom' } });

    await expect(
      createIssuedAccount(supabase, 'admin-1'),
    ).resolves.toBeDefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[adminAudit]'),
      expect.anything(),
    );
    errorSpy.mockRestore();
  });
});

describe('findReissuableAccount', () => {
  it('username を持つ行だけを対象にする', async () => {
    const { supabase, capture } = createSupabase({
      users: { data: { username: 'K7M2QXPT9WFN' } },
    });

    await findReissuableAccount(supabase, 'u1');

    // メールを持つ通常のアカウントを admin が差し替えられると、
    // バックドアの範囲が全アカウントへ広がる
    expect(capture.filters).toContainEqual({
      table: 'users',
      method: 'not',
      args: ['username', 'is', null],
    });
  });

  it('対象ならユーザー名を返す', async () => {
    const { supabase } = createSupabase({
      users: { data: { username: 'K7M2QXPT9WFN' } },
    });

    expect(await findReissuableAccount(supabase, 'u1')).toBe('K7M2QXPT9WFN');
  });

  it('対象外なら null を返す', async () => {
    const { supabase } = createSupabase({ users: { data: null } });

    expect(await findReissuableAccount(supabase, 'u1')).toBeNull();
  });
});

describe('recordReissueAudit', () => {
  it('再発行として記録する', async () => {
    const { supabase, capture } = createSupabase({});

    await recordReissueAudit(supabase, 'admin-1', 'u1');

    expect(capture.inserts).toContainEqual({
      table: 'admin_audit_logs',
      payload: {
        actor_user_id: 'admin-1',
        target_user_id: 'u1',
        action: 'account_reissue',
      },
    });
  });
});
