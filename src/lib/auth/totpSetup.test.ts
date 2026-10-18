/**
 * @jest-environment node
 */

import { randomBytes } from 'crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import { RECOVERY_CODE_CONFIG, TOTP_CONFIG } from '@/constants/totp';
import { decryptTotpSecret, encryptTotpSecret } from '@/lib/totp/encryption';
import { hashRecoveryCode } from '@/lib/totp/recoveryCodes';
import { base32Decode } from '@/lib/totp/base32';
import { generateTotpCode } from '@/lib/totp/totp';
import { generateTotpSecret } from '@/lib/totp/secret';

import {
  confirmTotpSetup,
  disableTotp,
  regenerateRecoveryCodes,
  startTotpSetup,
} from './totpSetup';

const TEST_KEY = randomBytes(32).toString('base64');
const USER_ID = '11111111-1111-1111-1111-111111111111';
const EMAIL = 'user@example.com';

interface FakeDb {
  totp: {
    user_id: string;
    encrypted_secret: string;
    confirmed_at: string | null;
    last_used_counter: number | null;
  } | null;
  recoveryCodes: Array<{ user_id: string; code_hash: string }>;
}

/**
 * Supabase の模擬
 *
 * 有効化は「設定途中の行だけを更新する」条件付きUPDATEなので、
 * `.is('confirmed_at', null)` を実際に評価する。
 */
function createSupabaseMock(db: FakeDb): SupabaseClient {
  const from = (table: string) => {
    const state: {
      action: 'select' | 'update' | 'delete' | 'insert';
      payload: Record<string, unknown>;
      requireUnconfirmed: boolean;
    } = {
      action: 'select',
      payload: {},
      requireUnconfirmed: false,
    };

    const builder: Record<string, unknown> = {};

    builder.select = jest.fn(() => builder);
    builder.eq = jest.fn(() => builder);
    builder.is = jest.fn((column: string) => {
      if (column === 'confirmed_at') state.requireUnconfirmed = true;
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
    builder.insert = jest.fn((payload: unknown) => {
      state.action = 'insert';
      if (table === 'user_totp') {
        db.totp = {
          ...(payload as FakeDb['totp'] & object),
          confirmed_at: null,
          last_used_counter: null,
        } as FakeDb['totp'];
      } else {
        db.recoveryCodes.push(
          ...(payload as Array<{ user_id: string; code_hash: string }>),
        );
      }
      return Promise.resolve({ error: null });
    });

    builder.maybeSingle = jest.fn(() =>
      Promise.resolve({ data: table === 'user_totp' ? db.totp : null }),
    );

    const resolve = () => {
      if (state.action === 'delete') {
        if (table === 'user_totp') db.totp = null;
        else db.recoveryCodes = [];
        return { data: null, error: null };
      }

      if (state.action === 'update' && table === 'user_totp') {
        if (!db.totp) return { data: [] };
        if (state.requireUnconfirmed && db.totp.confirmed_at) {
          return { data: [] };
        }
        db.totp.confirmed_at = state.payload.confirmed_at as string;
        return { data: [{ user_id: USER_ID }] };
      }

      return { data: null, error: null };
    };

    (builder as { then: unknown }).then = (
      onFulfilled: (value: unknown) => unknown,
    ) => Promise.resolve(resolve()).then(onFulfilled);

    return builder;
  };

  return { from: jest.fn(from) } as unknown as SupabaseClient;
}

const originalKey = process.env.TOTP_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.TOTP_ENCRYPTION_KEY = TEST_KEY;
});

afterAll(() => {
  process.env.TOTP_ENCRYPTION_KEY = originalKey;
});

const emptyDb = (): FakeDb => ({ totp: null, recoveryCodes: [] });

describe('startTotpSetup', () => {
  it('otpauth URI と手入力用の鍵を返す', async () => {
    const result = await startTotpSetup(
      createSupabaseMock(emptyDb()),
      USER_ID,
      EMAIL,
    );

    expect(result.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(result.secret).toMatch(/^[A-Z2-7]+$/);
  });

  it('URI に含まれる鍵と手入力用の鍵が一致する', async () => {
    // ここがずれると、QRで登録した利用者と手入力した利用者で結果が変わる
    const result = await startTotpSetup(
      createSupabaseMock(emptyDb()),
      USER_ID,
      EMAIL,
    );

    expect(new URL(result.otpauthUri).searchParams.get('secret')).toBe(
      result.secret,
    );
  });

  it('鍵を暗号化して保存する', async () => {
    const db = emptyDb();

    const result = await startTotpSetup(createSupabaseMock(db), USER_ID, EMAIL);

    expect(db.totp?.encrypted_secret).not.toContain(result.secret);
    expect(decryptTotpSecret(db.totp!.encrypted_secret)).toBe(result.secret);
  });

  it('設定途中として保存する（まだ有効化しない）', async () => {
    // QRを表示しただけで有効にすると、登録に失敗した利用者がロックアウトされる
    const db = emptyDb();

    await startTotpSetup(createSupabaseMock(db), USER_ID, EMAIL);

    expect(db.totp?.confirmed_at).toBeNull();
  });

  it('設定途中の行があれば作り直す', async () => {
    const db: FakeDb = {
      totp: {
        user_id: USER_ID,
        encrypted_secret: encryptTotpSecret('OLDSECRET'),
        confirmed_at: null,
        last_used_counter: 999,
      },
      recoveryCodes: [],
    };

    const result = await startTotpSetup(createSupabaseMock(db), USER_ID, EMAIL);

    expect(decryptTotpSecret(db.totp!.encrypted_secret)).toBe(result.secret);
    // 作り直しなので古いカウンタは残らない
    expect(db.totp?.last_used_counter).toBeNull();
  });

  it('既に有効化済みなら例外を投げる', async () => {
    const db: FakeDb = {
      totp: {
        user_id: USER_ID,
        encrypted_secret: encryptTotpSecret(generateTotpSecret()),
        confirmed_at: '2026-10-18T00:00:00Z',
        last_used_counter: null,
      },
      recoveryCodes: [],
    };

    await expect(
      startTotpSetup(createSupabaseMock(db), USER_ID, EMAIL),
    ).rejects.toThrow('already enabled');
  });

  it('設定どおりのバイト長の鍵を生成する', async () => {
    const result = await startTotpSetup(
      createSupabaseMock(emptyDb()),
      USER_ID,
      EMAIL,
    );

    expect(base32Decode(result.secret)).toHaveLength(TOTP_CONFIG.SECRET_BYTES);
  });
});

describe('confirmTotpSetup', () => {
  /** 設定途中の状態を作る */
  const setupInProgress = () => {
    const secret = generateTotpSecret();
    const db: FakeDb = {
      totp: {
        user_id: USER_ID,
        encrypted_secret: encryptTotpSecret(secret),
        confirmed_at: null,
        last_used_counter: null,
      },
      recoveryCodes: [],
    };
    return { secret, db };
  };

  it('正しいコードで有効化する', async () => {
    const { secret, db } = setupInProgress();

    await confirmTotpSetup(
      createSupabaseMock(db),
      USER_ID,
      generateTotpCode(secret),
    );

    expect(db.totp?.confirmed_at).not.toBeNull();
  });

  it('リカバリーコードを発行して返す', async () => {
    const { secret, db } = setupInProgress();

    const codes = await confirmTotpSetup(
      createSupabaseMock(db),
      USER_ID,
      generateTotpCode(secret),
    );

    expect(codes).toHaveLength(RECOVERY_CODE_CONFIG.COUNT);
    expect(db.recoveryCodes).toHaveLength(RECOVERY_CODE_CONFIG.COUNT);
  });

  it('返したコードのハッシュを保存する', async () => {
    const { secret, db } = setupInProgress();

    const codes = await confirmTotpSetup(
      createSupabaseMock(db),
      USER_ID,
      generateTotpCode(secret),
    );

    codes!.forEach((code) => {
      expect(db.recoveryCodes.map((row) => row.code_hash)).toContain(
        hashRecoveryCode(code),
      );
    });
  });

  it('誤ったコードでは有効化しない', async () => {
    const { db } = setupInProgress();

    await expect(
      confirmTotpSetup(createSupabaseMock(db), USER_ID, '000000'),
    ).resolves.toBeNull();
    expect(db.totp?.confirmed_at).toBeNull();
  });

  it('誤ったコードではリカバリーコードを発行しない', async () => {
    // 発行してから有効化に失敗すると、使えるコードがあるのに二段階認証は
    // 無効、という中途半端な状態になる
    const { db } = setupInProgress();

    await confirmTotpSetup(createSupabaseMock(db), USER_ID, '000000');

    expect(db.recoveryCodes).toHaveLength(0);
  });

  it('設定を開始していなければ null を返す', async () => {
    await expect(
      confirmTotpSetup(createSupabaseMock(emptyDb()), USER_ID, '123456'),
    ).resolves.toBeNull();
  });

  it('既に有効化済みなら null を返す', async () => {
    const secret = generateTotpSecret();
    const db: FakeDb = {
      totp: {
        user_id: USER_ID,
        encrypted_secret: encryptTotpSecret(secret),
        confirmed_at: '2026-10-18T00:00:00Z',
        last_used_counter: null,
      },
      recoveryCodes: [],
    };

    await expect(
      confirmTotpSetup(
        createSupabaseMock(db),
        USER_ID,
        generateTotpCode(secret),
      ),
    ).resolves.toBeNull();
  });

  it('前後の空白を無視する', async () => {
    const { secret, db } = setupInProgress();

    await expect(
      confirmTotpSetup(
        createSupabaseMock(db),
        USER_ID,
        `  ${generateTotpCode(secret)} `,
      ),
    ).resolves.toHaveLength(RECOVERY_CODE_CONFIG.COUNT);
  });
});

describe('disableTotp', () => {
  it('共有鍵とリカバリーコードを削除する', async () => {
    const db: FakeDb = {
      totp: {
        user_id: USER_ID,
        encrypted_secret: encryptTotpSecret(generateTotpSecret()),
        confirmed_at: '2026-10-18T00:00:00Z',
        last_used_counter: 1,
      },
      recoveryCodes: [{ user_id: USER_ID, code_hash: 'hash' }],
    };

    await disableTotp(createSupabaseMock(db), USER_ID);

    expect(db.totp).toBeNull();
    // 残すと、再度有効化したときに古いコードが生きているように見える
    expect(db.recoveryCodes).toHaveLength(0);
  });
});

describe('regenerateRecoveryCodes', () => {
  it('設定どおりの個数を発行する', async () => {
    const db = emptyDb();

    const codes = await regenerateRecoveryCodes(
      createSupabaseMock(db),
      USER_ID,
    );

    expect(codes).toHaveLength(RECOVERY_CODE_CONFIG.COUNT);
    expect(db.recoveryCodes).toHaveLength(RECOVERY_CODE_CONFIG.COUNT);
  });

  it('以前のコードを全て差し替える', async () => {
    // 使用済み・未使用を問わず消す。どれが生きているかを覚えさせない
    const db: FakeDb = {
      totp: null,
      recoveryCodes: [{ user_id: USER_ID, code_hash: 'old-hash' }],
    };

    await regenerateRecoveryCodes(createSupabaseMock(db), USER_ID);

    expect(db.recoveryCodes.map((row) => row.code_hash)).not.toContain(
      'old-hash',
    );
  });

  it('返したコードのハッシュを保存する', async () => {
    const db = emptyDb();

    const codes = await regenerateRecoveryCodes(
      createSupabaseMock(db),
      USER_ID,
    );

    expect(db.recoveryCodes.map((row) => row.code_hash)).toEqual(
      codes.map(hashRecoveryCode),
    );
  });
});
