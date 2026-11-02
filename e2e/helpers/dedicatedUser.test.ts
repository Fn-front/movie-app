/**
 * 専用テストユーザーの後片付けのテスト
 *
 * ここで担保するのは「削除の順序」と「失敗を握りつぶさないこと」。
 * この2点が崩れると、監査ログに阻まれて admin が消せず、残骸が次回以降の
 * run を 409（重複）で落とし続ける詰まりが起きる。
 */

import { deleteRunScopedUsers, deleteUserByEmail } from './dedicatedUser';

/** fetch の呼び出しを記録しつつ、URL ごとに応答を差し替える */
function mockFetch(
  responder: (url: string, method: string) => { ok: boolean; body?: unknown },
) {
  const calls: Array<{ url: string; method: string }> = [];

  global.fetch = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method });

      const { ok, body } = responder(url, method);
      return {
        ok,
        status: ok ? 200 : 409,
        json: async () => body ?? [],
        text: async () => JSON.stringify(body ?? {}),
      } as Response;
    },
  ) as unknown as typeof fetch;

  return calls;
}

/** 記録の中から、パスに文字列を含む呼び出しの位置を返す */
function indexOfCall(
  calls: Array<{ url: string; method: string }>,
  needle: string,
  method = 'DELETE',
): number {
  return calls.findIndex((c) => c.url.includes(needle) && c.method === method);
}

describe('deleteUserByEmail', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('発行アカウントを消してからユーザーを消す', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/users?') && url.includes('select=id')) {
        return { ok: true, body: [{ id: 'admin-1' }] };
      }
      if (url.includes('admin_audit_logs')) {
        return { ok: true, body: [{ target_user_id: 'issued-1' }] };
      }
      return { ok: true };
    });

    await deleteUserByEmail('admin@example.com');

    const issued = indexOfCall(calls, 'users?id=in.(issued-1)');
    const user = indexOfCall(calls, 'users?email=eq.');

    expect(issued).toBeGreaterThanOrEqual(0);
    expect(user).toBeGreaterThanOrEqual(0);
    // 監査ログの対象を先に消さないと ON DELETE RESTRICT で弾かれる
    expect(issued).toBeLessThan(user);
  });

  it('監査ログが無ければ発行アカウントの削除は行わない', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/users?') && url.includes('select=id')) {
        return { ok: true, body: [{ id: 'user-1' }] };
      }
      if (url.includes('admin_audit_logs')) return { ok: true, body: [] };
      return { ok: true };
    });

    await deleteUserByEmail('member@example.com');

    expect(indexOfCall(calls, 'users?id=in.')).toBe(-1);
    expect(indexOfCall(calls, 'users?email=eq.')).toBeGreaterThanOrEqual(0);
  });

  it('ユーザー削除が失敗したら投げる', async () => {
    mockFetch((url, method) => {
      if (url.includes('/users?') && url.includes('select=id')) {
        return { ok: true, body: [] };
      }
      if (url.includes('users?email=eq.') && method === 'DELETE') {
        return {
          ok: false,
          body: { code: '23503', message: 'still referenced' },
        };
      }
      return { ok: true };
    });

    await expect(deleteUserByEmail('admin@example.com')).rejects.toThrow(
      /削除に失敗した \(409\)/,
    );
  });

  it('ユーザーIDの取得が失敗したら投げる', async () => {
    mockFetch((url) => {
      if (url.includes('/users?') && url.includes('select=id')) {
        return { ok: false, body: { message: 'boom' } };
      }
      return { ok: true };
    });

    await expect(deleteUserByEmail('admin@example.com')).rejects.toThrow(
      /ユーザーID の取得に失敗した/,
    );
  });
});

describe('deleteRunScopedUsers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('発行アカウントを消してから run 固有ユーザーを消す', async () => {
    const calls = mockFetch((url) => {
      if (url.includes('/users?') && url.includes('select=id')) {
        return { ok: true, body: [{ id: 'admin-1' }, { id: 'admin-2' }] };
      }
      if (url.includes('admin_audit_logs')) {
        return {
          ok: true,
          body: [
            { target_user_id: 'issued-1' },
            // 同じ対象が複数回出ても1回にまとめる
            { target_user_id: 'issued-1' },
            { target_user_id: 'issued-2' },
          ],
        };
      }
      return { ok: true };
    });

    await deleteRunScopedUsers();

    const issued = indexOfCall(calls, 'users?id=in.(issued-1,issued-2)');
    const users = indexOfCall(calls, 'users?email=like.');

    expect(issued).toBeGreaterThanOrEqual(0);
    expect(issued).toBeLessThan(users);
  });

  it('削除が失敗したら投げる（握りつぶさない）', async () => {
    mockFetch((url, method) => {
      if (url.includes('/users?') && url.includes('select=id')) {
        return { ok: true, body: [] };
      }
      if (url.includes('users?email=like.') && method === 'DELETE') {
        return { ok: false, body: { code: '23503' } };
      }
      return { ok: true };
    });

    await expect(deleteRunScopedUsers()).rejects.toThrow(
      /run固有ユーザー の削除に失敗した/,
    );
  });
});
