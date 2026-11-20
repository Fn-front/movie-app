/**
 * @jest-environment node
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { PASSWORD_RESET_CONFIG } from '@/constants/passwordReset';
import { hashVerificationToken } from '@/lib/otp/verificationToken';

import {
  consumePasswordResetToken,
  invalidateAllPasswordResetTokens,
  invalidateOtherPasswordResetTokens,
  isPasswordResetTokenValid,
  issuePasswordResetToken,
  peekPasswordResetToken,
} from './passwordResetToken';

const USER_ID = '11111111-1111-1111-1111-111111111111';

/** 行の発行時刻の基準。DB の `now()` の代わりに単調増加させる */
const BASE_CREATED_AT = new Date('2026-01-01T00:00:00.000Z').getTime();

interface TokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

/**
 * password_reset_tokens の最小の模擬
 *
 * 「未使用かつ期限内のときだけ使用済みにする」を条件付きUPDATEの更新行数で
 * 判定しているため、条件（`.is` / `.gt`）を実際に評価する必要がある。
 * 評価しない模擬だと、使い回し・期限切れのテストが素通りしてしまう。
 */
function createSupabaseMock(rows: TokenRow[]): {
  client: SupabaseClient;
  rows: TokenRow[];
  inserted: Array<Record<string, unknown>>;
} {
  const inserted: Array<Record<string, unknown>> = [];
  let insertSeq = 0;

  const from = () => {
    const state: {
      action: 'select' | 'update' | 'delete' | 'insert';
      payload: Record<string, unknown>;
      tokenHash: string | null;
      excludeTokenHash: string | null;
      beforeCreatedAt: string | null;
      userId: string | null;
      requireUnused: boolean;
      notExpired: boolean;
    } = {
      action: 'select',
      payload: {},
      tokenHash: null,
      excludeTokenHash: null,
      beforeCreatedAt: null,
      userId: null,
      requireUnused: false,
      notExpired: false,
    };

    const builder: Record<string, unknown> = {};

    builder.select = jest.fn(() => builder);
    builder.eq = jest.fn((column: string, value: unknown) => {
      if (column === 'token_hash') state.tokenHash = value as string;
      if (column === 'user_id') state.userId = value as string;
      return builder;
    });
    builder.lt = jest.fn((column: string, value: unknown) => {
      if (column === 'created_at') state.beforeCreatedAt = value as string;
      return builder;
    });
    builder.neq = jest.fn((column: string, value: unknown) => {
      if (column === 'token_hash') state.excludeTokenHash = value as string;
      return builder;
    });
    builder.is = jest.fn((column: string) => {
      if (column === 'used_at') state.requireUnused = true;
      return builder;
    });
    builder.gt = jest.fn((column: string) => {
      if (column === 'expires_at') state.notExpired = true;
      return builder;
    });
    builder.update = jest.fn((payload: Record<string, unknown>) => {
      state.action = 'update';
      state.payload = payload;
      return builder;
    });
    builder.delete = jest.fn(() => {
      state.action = 'delete';
      return builder;
    });
    builder.insert = jest.fn((payload: Record<string, unknown>) => {
      state.action = 'insert';
      inserted.push(payload);
      // 実DBと同じく、挿入した行はその後の検索・削除の対象になる。
      // 載せないと「今発行した行が消えていないか」を検証できない
      insertSeq += 1;
      rows.push({
        id: `row-${rows.length + 1}`,
        user_id: payload.user_id as string,
        token_hash: payload.token_hash as string,
        expires_at: payload.expires_at as string,
        used_at: null,
        // DB の `now()` 既定値に相当。発行順に単調増加させる
        created_at: new Date(BASE_CREATED_AT + insertSeq * 1000).toISOString(),
      });
      return Promise.resolve({ error: null });
    });

    /** 条件に合致する行を返す */
    const matching = () =>
      rows.filter((row) => {
        if (state.tokenHash !== null && row.token_hash !== state.tokenHash) {
          return false;
        }
        if (
          state.excludeTokenHash !== null &&
          row.token_hash === state.excludeTokenHash
        ) {
          return false;
        }
        if (
          state.beforeCreatedAt !== null &&
          row.created_at >= state.beforeCreatedAt
        ) {
          return false;
        }
        if (state.userId !== null && row.user_id !== state.userId) return false;
        if (state.requireUnused && row.used_at) return false;
        if (state.notExpired && new Date(row.expires_at) <= new Date()) {
          return false;
        }
        return true;
      });

    const resolve = () => {
      if (state.action === 'update') {
        const targets = matching();
        targets.forEach((row) => {
          row.used_at = state.payload.used_at as string;
        });
        return { data: targets.map((row) => ({ user_id: row.user_id })) };
      }

      if (state.action === 'delete') {
        matching().forEach((row) => {
          rows.splice(rows.indexOf(row), 1);
        });
        return { data: null, error: null };
      }

      return { data: matching() };
    };

    builder.maybeSingle = jest.fn(() =>
      Promise.resolve({ data: matching()[0] ?? null }),
    );
    (builder as { then: unknown }).then = (
      onFulfilled: (value: unknown) => unknown,
    ) => Promise.resolve(resolve()).then(onFulfilled);

    return builder;
  };

  return {
    client: { from: jest.fn(from) } as unknown as SupabaseClient,
    rows,
    inserted,
  };
}

/** 有効なトークン行を作る */
const makeRow = (
  token: string,
  overrides: Partial<TokenRow> = {},
): TokenRow => ({
  id: 'row-1',
  user_id: USER_ID,
  token_hash: hashVerificationToken(token),
  expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  used_at: null,
  // 既存行は必ず「発行より前」。`lt('created_at', ...)` の対象になる
  created_at: new Date(BASE_CREATED_AT).toISOString(),
  ...overrides,
});

describe('issuePasswordResetToken', () => {
  it('平文トークンを返す', async () => {
    const { client } = createSupabaseMock([]);

    const token = await issuePasswordResetToken(client, USER_ID);

    expect(token).toMatch(/^[\w-]+$/);
    expect(token.length).toBeGreaterThan(20);
  });

  it('DBには平文ではなくハッシュを保存する', async () => {
    const { client, inserted } = createSupabaseMock([]);

    const token = await issuePasswordResetToken(client, USER_ID);

    expect(inserted[0].token_hash).toBe(hashVerificationToken(token));
    expect(JSON.stringify(inserted[0])).not.toContain(token);
  });

  it('設定どおりの有効期限を設定する', async () => {
    const { client, inserted } = createSupabaseMock([]);

    await issuePasswordResetToken(client, USER_ID);

    const expiresAt = new Date(inserted[0].expires_at as string).getTime();
    const expected =
      Date.now() + PASSWORD_RESET_CONFIG.EXPIRY_MINUTES * 60 * 1000;

    expect(Math.abs(expiresAt - expected)).toBeLessThan(5000);
  });

  it('古いトークンは消さない（送信前に消さない / #1223）', async () => {
    // 先に消すと、送信に失敗したとき相手の手元にあった有効なリンクだけが
    // 死に、新しいリンクは誰にも届かない
    const old = makeRow('old-token');
    const { client, rows } = createSupabaseMock([old]);

    await issuePasswordResetToken(client, USER_ID);

    expect(rows).toContain(old);
  });

  it('呼ぶたびに異なるトークンを返す', async () => {
    const { client } = createSupabaseMock([]);

    const first = await issuePasswordResetToken(client, USER_ID);
    const second = await issuePasswordResetToken(client, USER_ID);

    expect(first).not.toBe(second);
  });
});

/**
 * 古いリンクの無効化（#1223）
 *
 * 発行と切り離してある。送信に成功したあとだけ呼ぶことで、送れなかった
 * ときに相手の手元のリンクを壊さない
 */
/**
 * 再設定の完了後に残りを無効化する（#1301）
 *
 * ⛔ **`invalidateOtherPasswordResetTokens` とは条件が違う。** あちらは
 * 「いま配ったリンクだけ残す」ためのもので、こちらは**残すものが無い**。
 *
 * 以前は不要だった。発行の前に未使用を全削除していたため未使用は常に
 * 高々1本だったが、#1223 で掃除が「送信に成功したあと」へ移り、
 * **送信に失敗すると2本以上残る**ようになった。
 */
describe('invalidateAllPasswordResetTokens', () => {
  it('同一ユーザーの未使用トークンをすべて消す', async () => {
    const a = makeRow('token-a');
    const b = makeRow('token-b');
    const { client, rows } = createSupabaseMock([a, b]);

    await invalidateAllPasswordResetTokens(client, USER_ID);

    expect(rows).toHaveLength(0);
  });

  /**
   * ⛔ **いま使ったリンクも含めて消すのではない。**
   *
   * 消費は条件付き UPDATE で `used_at` が入っているので、ここの
   * `.is('used_at', null)` には当たらない。使用済みを消すと履歴が消える。
   */
  it('使用済みのトークンは消さない', async () => {
    const used = makeRow('used-token', { used_at: new Date().toISOString() });
    const { client, rows } = createSupabaseMock([used]);

    await invalidateAllPasswordResetTokens(client, USER_ID);

    expect(rows).toContain(used);
  });

  it('他のユーザーのトークンは消さない', async () => {
    const other = makeRow('other-token', { user_id: 'other-user' });
    const { client, rows } = createSupabaseMock([other]);

    await invalidateAllPasswordResetTokens(client, USER_ID);

    expect(rows).toContain(other);
  });

  /**
   * ⚠️ **投げない。** 呼ぶのは再設定が確定したあと。ここで例外を漏らすと、
   * パスワードは変わっているのに利用者には「失敗しました」と出て、
   * 古いパスワードで何度もやり直すことになる（#1223 と同じ判断）。
   */
  it('削除に失敗しても投げず、ログに出す', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = createSupabaseMock([]);
    jest.spyOn(client, 'from').mockReturnValue({
      delete: () => ({
        eq: () => ({
          is: () => Promise.resolve({ error: { message: 'db down' } }),
        }),
      }),
    } as never);

    await expect(
      invalidateAllPasswordResetTokens(client, USER_ID),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });

  /**
   * ⚠️ `error` を見るだけでは足りない。クライアントが**同期的に投げる**
   * 経路（接続断など）が残り、呼び出し側の catch に落ちて 500 になる。
   */
  it('クライアントが投げても飲み込む', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = createSupabaseMock([]);
    jest.spyOn(client, 'from').mockImplementation(() => {
      throw new Error('connection lost');
    });

    await expect(
      invalidateAllPasswordResetTokens(client, USER_ID),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });
});

describe('invalidateOtherPasswordResetTokens', () => {
  it('同一ユーザーの古い未使用トークンを消す', async () => {
    // 複数のリンクが同時に生きていると、古いメールを拾った第三者にも窓が残る
    const old = makeRow('old-token');
    const { client, rows } = createSupabaseMock([old]);

    const token = await issuePasswordResetToken(client, USER_ID);
    await invalidateOtherPasswordResetTokens(client, USER_ID, token);

    expect(rows).not.toContain(old);
  });

  it('今発行したトークンは残す', async () => {
    // 除外しないと、今メールで送った新しいリンクごと消える
    const { client, rows } = createSupabaseMock([makeRow('old-token')]);

    const token = await issuePasswordResetToken(client, USER_ID);
    await invalidateOtherPasswordResetTokens(client, USER_ID, token);

    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(hashVerificationToken(token));
  });

  it('使用済みのトークンは消さない', async () => {
    // 消す理由がない。履歴としても残す
    const used = makeRow('used-token', { used_at: new Date().toISOString() });
    const { client, rows } = createSupabaseMock([used]);

    const token = await issuePasswordResetToken(client, USER_ID);
    await invalidateOtherPasswordResetTokens(client, USER_ID, token);

    expect(rows).toContain(used);
  });

  it('他のユーザーのトークンは消さない', async () => {
    const other = makeRow('other-token', { user_id: 'other-user' });
    const { client, rows } = createSupabaseMock([other]);

    const token = await issuePasswordResetToken(client, USER_ID);
    await invalidateOtherPasswordResetTokens(client, USER_ID, token);

    expect(rows).toContain(other);
  });

  /**
   * 同時リクエストの交差（レビュー指摘）
   *
   * `neq` だけで「自分以外」を消すと、同時に走っている別リクエストが
   * 入れたトークンまで消してしまい、互いの行を消し合って**有効なリンクが
   * 0本**になる。2通のメールを送ったのにどちらも使えない＝ #1223 と同じ
   * 行き止まり。`lt('created_at', 自分の発行時刻)` で塞いでいる
   */
  describe('同時に2本発行されたとき', () => {
    it('どちらの無効化が先でも、有効なリンクが1本は残る', async () => {
      const old = makeRow('old-token');
      const { client, rows } = createSupabaseMock([old]);

      const tokenA = await issuePasswordResetToken(client, USER_ID);
      const tokenB = await issuePasswordResetToken(client, USER_ID);

      await invalidateOtherPasswordResetTokens(client, USER_ID, tokenA);
      await invalidateOtherPasswordResetTokens(client, USER_ID, tokenB);

      expect(rows.length).toBeGreaterThan(0);
      expect(rows).not.toContain(old);
    });

    it('無効化の順序が逆でも1本は残る', async () => {
      const { client, rows } = createSupabaseMock([makeRow('old-token')]);

      const tokenA = await issuePasswordResetToken(client, USER_ID);
      const tokenB = await issuePasswordResetToken(client, USER_ID);

      await invalidateOtherPasswordResetTokens(client, USER_ID, tokenB);
      await invalidateOtherPasswordResetTokens(client, USER_ID, tokenA);

      expect(rows.length).toBeGreaterThan(0);
    });

    it('最後に発行した1本が残る（古いほうは消える）', async () => {
      // 旧実装（INSERT の前に DELETE）の成功時と同じ挙動に揃える
      const { client, rows } = createSupabaseMock([makeRow('old-token')]);

      const tokenA = await issuePasswordResetToken(client, USER_ID);
      const tokenB = await issuePasswordResetToken(client, USER_ID);

      await invalidateOtherPasswordResetTokens(client, USER_ID, tokenA);
      await invalidateOtherPasswordResetTokens(client, USER_ID, tokenB);

      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash).toBe(hashVerificationToken(tokenB));
    });
  });

  it('削除に失敗しても投げず、ログに残す', async () => {
    // 送信は既に済んでいる。ここで 500 を返すと admin は押し直して
    // もう1通送ることになり、枠も減る
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const client = {
      from: () => ({
        // 残すトークンの発行時刻の引き直し
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { created_at: '2026-01-01T00:00:01.000Z' },
                error: null,
              }),
          }),
        }),
        delete: () => ({
          eq: () => ({
            is: () => ({
              neq: () => ({
                lt: () =>
                  Promise.resolve({ error: { message: 'delete failed' } }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    await expect(
      invalidateOtherPasswordResetTokens(client, USER_ID, 'token'),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});

/**
 * 消費せずに引く（#1235）
 *
 * 回復可能なエラー（新旧同一パスワードなど）で弾く場合に、リンクを焼かずに
 * 済ませるために使う。焼いてしまうと入力を直してもやり直せない
 */
describe('peekPasswordResetToken', () => {
  it('有効なトークンでユーザーIDを返す', async () => {
    const { client } = createSupabaseMock([makeRow('valid-token')]);

    await expect(
      peekPasswordResetToken(client, 'valid-token'),
    ).resolves.toEqual({ status: 'valid', userId: USER_ID });
  });

  it('⚠️ 消費しない', async () => {
    // ここで焼いてしまうと、この関数を作った意味が無い
    const { client, rows } = createSupabaseMock([makeRow('valid-token')]);

    await peekPasswordResetToken(client, 'valid-token');

    expect(rows[0].used_at).toBeNull();
  });

  it('使用済みなら used', async () => {
    const used = makeRow('used-token', { used_at: new Date().toISOString() });
    const { client } = createSupabaseMock([used]);

    await expect(peekPasswordResetToken(client, 'used-token')).resolves.toEqual(
      { status: 'used' },
    );
  });

  it('期限切れなら expired', async () => {
    const expired = makeRow('expired-token', {
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const { client } = createSupabaseMock([expired]);

    await expect(
      peekPasswordResetToken(client, 'expired-token'),
    ).resolves.toEqual({ status: 'expired' });
  });

  it('使用済みかつ期限切れなら used を優先する', async () => {
    const both = makeRow('both-token', {
      used_at: new Date(Date.now() - 2000).toISOString(),
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const { client } = createSupabaseMock([both]);

    await expect(peekPasswordResetToken(client, 'both-token')).resolves.toEqual(
      { status: 'used' },
    );
  });

  it('存在しなければ invalid', async () => {
    const { client } = createSupabaseMock([makeRow('valid-token')]);

    await expect(
      peekPasswordResetToken(client, 'unknown-token'),
    ).resolves.toEqual({ status: 'invalid' });
  });

  /**
   * 読み取りの失敗を `invalid` に化かさない（#1167 と同じ理由）
   *
   * 本当に無効なトークンと区別がつかず、利用者はリセットの再申請へ
   * 誘導される。トークンは焼いていないので再試行は成功しうる
   */
  it('読み取りに失敗したら invalid ではなく投げる', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: null,
                error: { code: '57P01', message: 'connection terminated' },
              }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    await expect(
      peekPasswordResetToken(client, 'any-token'),
    ).rejects.toMatchObject({ code: '57P01' });
  });
});

describe('consumePasswordResetToken', () => {
  it('有効なトークンでユーザーIDを返す', async () => {
    const { client } = createSupabaseMock([makeRow('valid-token')]);

    await expect(
      consumePasswordResetToken(client, 'valid-token'),
    ).resolves.toEqual({ status: 'consumed', userId: USER_ID });
  });

  it('使用したトークンを使用済みにする', async () => {
    const { client, rows } = createSupabaseMock([makeRow('valid-token')]);

    await consumePasswordResetToken(client, 'valid-token');

    expect(rows[0].used_at).not.toBeNull();
  });

  it('成功したときは理由を引き直さない', async () => {
    // 失敗したときだけ追加の SELECT を出す。最頻パスを1往復に保つ
    const { client } = createSupabaseMock([makeRow('valid-token')]);

    await consumePasswordResetToken(client, 'valid-token');

    expect(client.from).toHaveBeenCalledTimes(1);
  });

  /**
   * 0行だった理由を伝える（#1232）
   *
   * 条件付き UPDATE の更新行数だけでは「見つからない」「使用済み」
   * 「期限切れ」を区別できない。すべて同じ文言になると、設定を終えた人が
   * リンクを開き直したときに「有効期限が切れています」と出る
   */
  describe('消費できなかった理由', () => {
    it('同じトークンの2回目は used を返す', async () => {
      const { client } = createSupabaseMock([makeRow('valid-token')]);

      await consumePasswordResetToken(client, 'valid-token');

      await expect(
        consumePasswordResetToken(client, 'valid-token'),
      ).resolves.toEqual({ status: 'used' });
    });

    it('最初から使用済みのトークンは used を返す', async () => {
      const used = makeRow('used-token', {
        used_at: new Date().toISOString(),
      });
      const { client } = createSupabaseMock([used]);

      await expect(
        consumePasswordResetToken(client, 'used-token'),
      ).resolves.toEqual({ status: 'used' });
    });

    it('期限切れのトークンは expired を返す', async () => {
      const expired = makeRow('expired-token', {
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      const { client } = createSupabaseMock([expired]);

      await expect(
        consumePasswordResetToken(client, 'expired-token'),
      ).resolves.toEqual({ status: 'expired' });
    });

    it('使用済みかつ期限切れなら used を優先する', async () => {
      // 設定を終えた人が後から開き直す経路。「期限切れ」と言われるより
      // 「使用済み」と言われたほうが、次にすること（ログイン）が分かる
      const both = makeRow('both-token', {
        used_at: new Date(Date.now() - 2000).toISOString(),
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      const { client } = createSupabaseMock([both]);

      await expect(
        consumePasswordResetToken(client, 'both-token'),
      ).resolves.toEqual({ status: 'used' });
    });

    it('存在しないトークンは invalid を返す', async () => {
      const { client } = createSupabaseMock([makeRow('valid-token')]);

      await expect(
        consumePasswordResetToken(client, 'unknown-token'),
      ).resolves.toEqual({ status: 'invalid' });
    });

    it('未使用・期限内なのに0行なら used（同時に2回開かれた）', async () => {
      // 相手のリクエストが先に消費し切った直後。こちらからは行が
      // 未使用に見えることがある。使えないことに変わりはない
      const client = {
        from: () => ({
          update: () => ({
            eq: () => ({
              is: () => ({
                gt: () => ({ select: () => Promise.resolve({ data: [] }) }),
              }),
            }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    used_at: null,
                    expires_at: new Date(Date.now() + 60_000).toISOString(),
                  },
                }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      await expect(
        consumePasswordResetToken(client, 'raced-token'),
      ).resolves.toEqual({ status: 'used' });
    });

    /**
     * 引き直しの失敗も `invalid` に化かさない（#1167 と同じ理由）
     *
     * UPDATE が0行だったあとの SELECT が落ちたときに `invalid` を返すと、
     * 本当に無効なトークンと区別がつかない。**トークンは焼かれていない**
     * ので、投げて再試行させるほうがよい
     */
    it('理由の引き直しに失敗したら invalid ではなく投げる', async () => {
      const client = {
        from: () => ({
          update: () => ({
            eq: () => ({
              is: () => ({
                gt: () => ({ select: () => Promise.resolve({ data: [] }) }),
              }),
            }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: null,
                  error: { code: '57P01', message: 'connection terminated' },
                }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      await expect(
        consumePasswordResetToken(client, 'any-token'),
      ).rejects.toMatchObject({ code: '57P01' });
    });
  });

  it('期限切れのトークンは使用済みにしない', async () => {
    const expired = makeRow('expired-token', {
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const { client, rows } = createSupabaseMock([expired]);

    await consumePasswordResetToken(client, 'expired-token');

    expect(rows[0].used_at).toBeNull();
  });

  /**
   * DB障害を「無効なトークン」に化かさない（#1167）
   *
   * `invalid` を返すと呼び出し側（`password-reset/confirm`）が
   * 400 を返すため、本当に無効なトークンと区別がつかない。
   * 利用者はリセットの再申請へ誘導される。パスワードを忘れている＝
   * 他にログイン手段が無い状態なので、黙って弾くより投げるほうがよい
   */
  it('読み取りに失敗したら理由を返さず投げる', async () => {
    const client = {
      from: () => ({
        update: () => ({
          eq: () => ({
            is: () => ({
              gt: () => ({
                select: () =>
                  Promise.resolve({
                    data: null,
                    error: { code: '57P01', message: 'connection terminated' },
                  }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    await expect(
      consumePasswordResetToken(client, 'any-token'),
    ).rejects.toMatchObject({ code: '57P01' });
  });
});

describe('isPasswordResetTokenValid', () => {
  it('有効なトークンなら true', async () => {
    const { client } = createSupabaseMock([makeRow('valid-token')]);

    await expect(
      isPasswordResetTokenValid(client, 'valid-token'),
    ).resolves.toBe(true);
  });

  it('確認しただけでは消費しない', async () => {
    const { client, rows } = createSupabaseMock([makeRow('valid-token')]);

    await isPasswordResetTokenValid(client, 'valid-token');

    expect(rows[0].used_at).toBeNull();
  });

  // consume 側と同じ理由（#1167）。この関数は現時点で呼び出し元が無いが、
  // 罠を残すと新しい呼び出し側が同じ誤りを引き継ぐ
  it('読み取りに失敗したら false ではなく投げる', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              gt: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: null,
                    error: { code: '57P01', message: 'connection terminated' },
                  }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    await expect(
      isPasswordResetTokenValid(client, 'any-token'),
    ).rejects.toMatchObject({ code: '57P01' });
  });

  it.each([
    [
      '期限切れ',
      makeRow('t', { expires_at: new Date(Date.now() - 1000).toISOString() }),
    ],
    ['使用済み', makeRow('t', { used_at: new Date().toISOString() })],
  ])('%s なら false', async (_label, row) => {
    const { client } = createSupabaseMock([row]);

    await expect(isPasswordResetTokenValid(client, 't')).resolves.toBe(false);
  });

  it('存在しないトークンなら false', async () => {
    const { client } = createSupabaseMock([]);

    await expect(isPasswordResetTokenValid(client, 'nope')).resolves.toBe(
      false,
    );
  });
});
