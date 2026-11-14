/**
 * @jest-environment node
 */

import { randomBytes } from 'crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { encryptTotpSecret } from '@/lib/totp/encryption';
import { generateRecoveryCodes } from '@/lib/totp/recoveryCodes';
import { generateTotpSecret } from '@/lib/totp/secret';
import { generateTotpCode } from '@/lib/totp/totp';

import {
  countUnusedRecoveryCodes,
  isTotpEnabled,
  TOTP_VERIFY_RESULT,
  verifySecondFactor,
} from './totpVerification';

const TEST_KEY = randomBytes(32).toString('base64');
const USER_ID = '11111111-1111-1111-1111-111111111111';

/** 1件の user_totp 行と、未使用リカバリーコードを保持する最小のDB模擬 */
interface FakeDb {
  totp: {
    encrypted_secret: string;
    confirmed_at: string | null;
    last_used_counter: number | null;
  } | null;
  recoveryCodes: Array<{
    id: string;
    code_hash: string;
    used_at: string | null;
  }>;
}

/**
 * Supabase クライアントの模擬を作る
 *
 * 条件付きUPDATEの「更新行数」で使い回しを判定しているため、条件（`.or` /
 * `.is('used_at', null)`）を実際に評価する必要がある。評価しない模擬だと
 * 使い回しのテストが素通りしてしまう。
 */
function createSupabaseMock(db: FakeDb): SupabaseClient {
  const from = (table: string) => {
    const state: {
      action: 'select' | 'update';
      payload: Record<string, unknown>;
      requireUnusedCounter: number | null;
      requireUnusedAt: boolean;
      requireConfirmed: boolean;
      matchedId: string | null;
    } = {
      action: 'select',
      payload: {},
      requireUnusedCounter: null,
      requireUnusedAt: false,
      requireConfirmed: false,
      matchedId: null,
    };

    const builder: Record<string, unknown> = {};

    builder.select = jest.fn(() => builder);
    builder.eq = jest.fn((column: string, value: unknown) => {
      if (column === 'id') state.matchedId = value as string;
      return builder;
    });
    builder.not = jest.fn((column: string) => {
      if (column === 'confirmed_at') state.requireConfirmed = true;
      return builder;
    });
    builder.is = jest.fn((column: string) => {
      if (column === 'used_at') state.requireUnusedAt = true;
      return builder;
    });
    builder.or = jest.fn((expression: string) => {
      const match = expression.match(/last_used_counter\.lt\.(\d+)/);
      if (match) state.requireUnusedCounter = Number(match[1]);
      return builder;
    });
    builder.update = jest.fn((payload: Record<string, unknown>) => {
      state.action = 'update';
      state.payload = payload;
      return builder;
    });

    builder.maybeSingle = jest.fn(() => {
      if (table !== 'user_totp') return Promise.resolve({ data: null });
      if (!db.totp) return Promise.resolve({ data: null });
      if (state.requireConfirmed && !db.totp.confirmed_at) {
        return Promise.resolve({ data: null });
      }
      return Promise.resolve({ data: db.totp });
    });

    const resolve = () => {
      if (table === 'user_totp' && state.action === 'update') {
        const counter = state.payload.last_used_counter as number;
        const current = db.totp?.last_used_counter ?? null;
        const allowed =
          state.requireUnusedCounter === null ||
          current === null ||
          current < state.requireUnusedCounter;

        if (!db.totp || !allowed) return { data: [] };

        db.totp.last_used_counter = counter;
        return { data: [{ user_id: USER_ID }] };
      }

      if (table === 'totp_recovery_codes' && state.action === 'update') {
        const row = db.recoveryCodes.find((c) => c.id === state.matchedId);
        if (!row || (state.requireUnusedAt && row.used_at)) return { data: [] };

        row.used_at = state.payload.used_at as string;
        return { data: [{ id: row.id }] };
      }

      if (table === 'totp_recovery_codes') {
        return {
          data: db.recoveryCodes.filter(
            (c) => !state.requireUnusedAt || !c.used_at,
          ),
        };
      }

      return { data: null };
    };

    (builder as { then: unknown }).then = (
      onFulfilled: (value: unknown) => unknown,
    ) => Promise.resolve(resolve()).then(onFulfilled);

    return builder;
  };

  return { from: jest.fn(from) } as unknown as SupabaseClient;
}

/**
 * すべてのクエリが error を返す模擬（DB障害を模す）
 *
 * Supabase は接続断・タイムアウト・PostgREST エラーのいずれでも
 * `data: null` を返す。「行が無い」と区別できるのは `error` だけなので、
 * それを無視すると障害が「未設定」「未登録」に化ける
 */
function createFailingSupabaseMock(): SupabaseClient {
  const result = {
    data: null,
    error: { message: 'connection terminated unexpectedly', code: '57P01' },
  };

  const builder: Record<string, unknown> = {};
  const self = () => builder;

  builder.select = jest.fn(self);
  builder.eq = jest.fn(self);
  builder.not = jest.fn(self);
  builder.is = jest.fn(self);
  builder.or = jest.fn(self);
  builder.update = jest.fn(self);
  builder.maybeSingle = jest.fn(() => Promise.resolve(result));
  (builder as { then: unknown }).then = (
    onFulfilled: (value: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled);

  return { from: jest.fn(() => builder) } as unknown as SupabaseClient;
}

const originalKey = process.env.TOTP_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.TOTP_ENCRYPTION_KEY = TEST_KEY;
});

afterAll(() => {
  process.env.TOTP_ENCRYPTION_KEY = originalKey;
});

describe('isTotpEnabled', () => {
  it('確認済みの行があれば true', async () => {
    const db: FakeDb = {
      totp: {
        encrypted_secret: encryptTotpSecret(generateTotpSecret()),
        confirmed_at: '2026-10-18T00:00:00Z',
        last_used_counter: null,
      },
      recoveryCodes: [],
    };

    await expect(isTotpEnabled(createSupabaseMock(db), USER_ID)).resolves.toBe(
      true,
    );
  });

  it('設定途中（confirmed_at が NULL）は false', async () => {
    // QRを表示しただけの段階でログインを止めると、認証アプリに登録し損ねた
    // 利用者がそのままロックアウトされる
    const db: FakeDb = {
      totp: {
        encrypted_secret: encryptTotpSecret(generateTotpSecret()),
        confirmed_at: null,
        last_used_counter: null,
      },
      recoveryCodes: [],
    };

    await expect(isTotpEnabled(createSupabaseMock(db), USER_ID)).resolves.toBe(
      false,
    );
  });

  it('行が無ければ false', async () => {
    const db: FakeDb = { totp: null, recoveryCodes: [] };

    await expect(isTotpEnabled(createSupabaseMock(db), USER_ID)).resolves.toBe(
      false,
    );
  });

  /**
   * ⚠️ ここが false に倒れると**第2要素が丸ごと飛ぶ**
   *
   * `auth.ts` のログイン3経路（パスワード / OTP / OAuth）はいずれも
   * 「有効なら止める」側のガードなので、false は素通りを意味する。
   * DB の不調だけで 7日間有効なセッションが発行されてしまう
   */
  it('DB エラーなら throw する（未設定として扱わない）', async () => {
    await expect(
      isTotpEnabled(createFailingSupabaseMock(), USER_ID),
    ).rejects.toMatchObject({ code: '57P01' });
  });
});

describe('verifySecondFactor（DB エラー）', () => {
  // 現状は NOT_ENABLED / INVALID（＝拒否側）に倒れるので直ちに危険では
  // ないが、障害が「未設定」「コード違い」に化けて切り分けができない
  it('認証アプリのコードの検証中に DB エラーなら throw する', async () => {
    await expect(
      verifySecondFactor(createFailingSupabaseMock(), USER_ID, '123456'),
    ).rejects.toMatchObject({ code: '57P01' });
  });

  it('リカバリーコードの検証中に DB エラーなら throw する', async () => {
    await expect(
      verifySecondFactor(
        createFailingSupabaseMock(),
        USER_ID,
        'AAAA-BBBB-CCCC',
      ),
    ).rejects.toMatchObject({ code: '57P01' });
  });
});

describe('verifySecondFactor（認証アプリのコード）', () => {
  const secret = generateTotpSecret();

  const makeDb = (lastUsedCounter: number | null = null): FakeDb => ({
    totp: {
      encrypted_secret: encryptTotpSecret(secret),
      confirmed_at: '2026-10-18T00:00:00Z',
      last_used_counter: lastUsedCounter,
    },
    recoveryCodes: [],
  });

  it('正しいコードを受け付ける', async () => {
    const db = makeDb();

    await expect(
      verifySecondFactor(
        createSupabaseMock(db),
        USER_ID,
        generateTotpCode(secret),
      ),
    ).resolves.toBe(TOTP_VERIFY_RESULT.SUCCESS);
  });

  it('成功したステップを記録する', async () => {
    // 記録しないと同じコードを何度でも使える
    const db = makeDb();

    await verifySecondFactor(
      createSupabaseMock(db),
      USER_ID,
      generateTotpCode(secret),
    );

    expect(db.totp?.last_used_counter).toBeGreaterThan(0);
  });

  it('誤ったコードを拒否する', async () => {
    const db = makeDb();

    await expect(
      verifySecondFactor(createSupabaseMock(db), USER_ID, '000000'),
    ).resolves.toBe(TOTP_VERIFY_RESULT.INVALID);
  });

  it('同じコードの2回目を拒否する', async () => {
    const db = makeDb();
    const supabase = createSupabaseMock(db);
    const code = generateTotpCode(secret);

    await expect(verifySecondFactor(supabase, USER_ID, code)).resolves.toBe(
      TOTP_VERIFY_RESULT.SUCCESS,
    );
    await expect(verifySecondFactor(supabase, USER_ID, code)).resolves.toBe(
      TOTP_VERIFY_RESULT.REUSED,
    );
  });

  it('既に進んだステップより古いコードを拒否する', async () => {
    // 窓の範囲内でも、より新しいコードを使ったあとに古いものへ戻すことはできない
    const current = Math.floor(Date.now() / 1000 / 30);
    const db = makeDb(current + 1);

    await expect(
      verifySecondFactor(
        createSupabaseMock(db),
        USER_ID,
        generateTotpCode(secret),
      ),
    ).resolves.toBe(TOTP_VERIFY_RESULT.REUSED);
  });

  it('前後の空白を無視する', async () => {
    const db = makeDb();

    await expect(
      verifySecondFactor(
        createSupabaseMock(db),
        USER_ID,
        `  ${generateTotpCode(secret)} `,
      ),
    ).resolves.toBe(TOTP_VERIFY_RESULT.SUCCESS);
  });

  it('二段階認証が有効でなければ not_enabled', async () => {
    const db: FakeDb = { totp: null, recoveryCodes: [] };

    await expect(
      verifySecondFactor(createSupabaseMock(db), USER_ID, '123456'),
    ).resolves.toBe(TOTP_VERIFY_RESULT.NOT_ENABLED);
  });

  it('設定途中のユーザーは not_enabled', async () => {
    const db: FakeDb = {
      totp: {
        encrypted_secret: encryptTotpSecret(secret),
        confirmed_at: null,
        last_used_counter: null,
      },
      recoveryCodes: [],
    };

    await expect(
      verifySecondFactor(
        createSupabaseMock(db),
        USER_ID,
        generateTotpCode(secret),
      ),
    ).resolves.toBe(TOTP_VERIFY_RESULT.NOT_ENABLED);
  });
});

describe('verifySecondFactor（リカバリーコード）', () => {
  const buildDb = () => {
    const { codes, hashes } = generateRecoveryCodes();
    const db: FakeDb = {
      totp: {
        encrypted_secret: encryptTotpSecret(generateTotpSecret()),
        confirmed_at: '2026-10-18T00:00:00Z',
        last_used_counter: null,
      },
      recoveryCodes: hashes.map((code_hash, index) => ({
        id: `code-${index}`,
        code_hash,
        used_at: null,
      })),
    };
    return { codes, db };
  };

  it('正しいリカバリーコードを受け付ける', async () => {
    const { codes, db } = buildDb();

    await expect(
      verifySecondFactor(createSupabaseMock(db), USER_ID, codes[0]),
    ).resolves.toBe(TOTP_VERIFY_RESULT.SUCCESS);
  });

  it('使用したコードを使用済みにする', async () => {
    const { codes, db } = buildDb();

    await verifySecondFactor(createSupabaseMock(db), USER_ID, codes[2]);

    expect(db.recoveryCodes[2].used_at).not.toBeNull();
    // 他のコードは巻き込まない
    expect(db.recoveryCodes[0].used_at).toBeNull();
  });

  it('同じリカバリーコードの2回目を拒否する', async () => {
    const { codes, db } = buildDb();
    const supabase = createSupabaseMock(db);

    await expect(verifySecondFactor(supabase, USER_ID, codes[0])).resolves.toBe(
      TOTP_VERIFY_RESULT.SUCCESS,
    );
    await expect(verifySecondFactor(supabase, USER_ID, codes[0])).resolves.toBe(
      TOTP_VERIFY_RESULT.INVALID,
    );
  });

  it('表示形式の揺れ（小文字・ハイフンなし）を受け付ける', async () => {
    const { codes, db } = buildDb();

    await expect(
      verifySecondFactor(
        createSupabaseMock(db),
        USER_ID,
        codes[1].toLowerCase().replace('-', ''),
      ),
    ).resolves.toBe(TOTP_VERIFY_RESULT.SUCCESS);
  });

  it('存在しないリカバリーコードを拒否する', async () => {
    const { db } = buildDb();

    await expect(
      verifySecondFactor(createSupabaseMock(db), USER_ID, 'ZZZZZ-ZZZZZ'),
    ).resolves.toBe(TOTP_VERIFY_RESULT.INVALID);
  });

  it('コードを使い切っていたら拒否する', async () => {
    const { codes, db } = buildDb();
    db.recoveryCodes.forEach((row) => {
      row.used_at = '2026-10-18T00:00:00Z';
    });

    await expect(
      verifySecondFactor(createSupabaseMock(db), USER_ID, codes[0]),
    ).resolves.toBe(TOTP_VERIFY_RESULT.INVALID);
  });
});

describe('countUnusedRecoveryCodes', () => {
  it('未使用の件数を返す', async () => {
    const supabase = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn(() => Promise.resolve({ count: 7 })),
      })),
    } as unknown as SupabaseClient;

    await expect(countUnusedRecoveryCodes(supabase, USER_ID)).resolves.toBe(7);
  });

  it('件数が取れなければ 0 を返す', async () => {
    const supabase = {
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn(() => Promise.resolve({ count: null })),
      })),
    } as unknown as SupabaseClient;

    await expect(countUnusedRecoveryCodes(supabase, USER_ID)).resolves.toBe(0);
  });
});
