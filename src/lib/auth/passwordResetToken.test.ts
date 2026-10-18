/**
 * @jest-environment node
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { PASSWORD_RESET_CONFIG } from '@/constants/passwordReset';
import { hashVerificationToken } from '@/lib/otp/verificationToken';

import {
  consumePasswordResetToken,
  isPasswordResetTokenValid,
  issuePasswordResetToken,
} from './passwordResetToken';

const USER_ID = '11111111-1111-1111-1111-111111111111';

interface TokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
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

  const from = () => {
    const state: {
      action: 'select' | 'update' | 'delete' | 'insert';
      payload: Record<string, unknown>;
      tokenHash: string | null;
      userId: string | null;
      requireUnused: boolean;
      notExpired: boolean;
    } = {
      action: 'select',
      payload: {},
      tokenHash: null,
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
      return Promise.resolve({ error: null });
    });

    /** 条件に合致する行を返す */
    const matching = () =>
      rows.filter((row) => {
        if (state.tokenHash !== null && row.token_hash !== state.tokenHash) {
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

  it('同一ユーザーの未使用トークンを無効化する', async () => {
    // 複数のリンクが同時に生きていると、古いメールを拾った第三者にも窓が残る
    const old = makeRow('old-token');
    const { client, rows } = createSupabaseMock([old]);

    await issuePasswordResetToken(client, USER_ID);

    expect(rows).not.toContain(old);
  });

  it('呼ぶたびに異なるトークンを返す', async () => {
    const { client } = createSupabaseMock([]);

    const first = await issuePasswordResetToken(client, USER_ID);
    const second = await issuePasswordResetToken(client, USER_ID);

    expect(first).not.toBe(second);
  });
});

describe('consumePasswordResetToken', () => {
  it('有効なトークンでユーザーIDを返す', async () => {
    const { client } = createSupabaseMock([makeRow('valid-token')]);

    await expect(
      consumePasswordResetToken(client, 'valid-token'),
    ).resolves.toBe(USER_ID);
  });

  it('使用したトークンを使用済みにする', async () => {
    const { client, rows } = createSupabaseMock([makeRow('valid-token')]);

    await consumePasswordResetToken(client, 'valid-token');

    expect(rows[0].used_at).not.toBeNull();
  });

  it('同じトークンの2回目は null を返す', async () => {
    const { client } = createSupabaseMock([makeRow('valid-token')]);

    await consumePasswordResetToken(client, 'valid-token');

    await expect(
      consumePasswordResetToken(client, 'valid-token'),
    ).resolves.toBeNull();
  });

  it('期限切れのトークンは null を返す', async () => {
    const expired = makeRow('expired-token', {
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const { client } = createSupabaseMock([expired]);

    await expect(
      consumePasswordResetToken(client, 'expired-token'),
    ).resolves.toBeNull();
  });

  it('期限切れのトークンは使用済みにしない', async () => {
    const expired = makeRow('expired-token', {
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const { client, rows } = createSupabaseMock([expired]);

    await consumePasswordResetToken(client, 'expired-token');

    expect(rows[0].used_at).toBeNull();
  });

  it('存在しないトークンは null を返す', async () => {
    const { client } = createSupabaseMock([makeRow('valid-token')]);

    await expect(
      consumePasswordResetToken(client, 'unknown-token'),
    ).resolves.toBeNull();
  });

  it('既に使用済みのトークンは null を返す', async () => {
    const used = makeRow('used-token', {
      used_at: new Date().toISOString(),
    });
    const { client } = createSupabaseMock([used]);

    await expect(
      consumePasswordResetToken(client, 'used-token'),
    ).resolves.toBeNull();
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
