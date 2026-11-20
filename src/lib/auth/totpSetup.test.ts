/**
 * @jest-environment node
 */

import { randomBytes } from 'crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  RECOVERY_CODE_CONFIG,
  TOTP_CONFIG,
  TOTP_SETUP_PENDING_TTL_MINUTES,
} from '@/constants/totp';
import {
  SECOND_FACTOR_METHOD,
  type SecondFactorMethod,
} from '@/constants/secondFactor';
import { decryptTotpSecret, encryptTotpSecret } from '@/lib/totp/encryption';
import { hashRecoveryCode } from '@/lib/totp/recoveryCodes';
import { base32Decode } from '@/lib/totp/base32';
import { generateTotpCode } from '@/lib/totp/totp';
import { generateTotpSecret } from '@/lib/totp/secret';

import {
  confirmSecondFactorSetup,
  disableTotp,
  regenerateRecoveryCodes,
  SECOND_FACTOR_SETUP_EXPIRED,
  startSecondFactorSetup,
  TotpAlreadyEnabledError,
  type ConfirmSecondFactorSetupResult,
} from './totpSetup';

// --- Mocks ---

const mockSendSecondFactorCode = jest.fn();
jest.mock('./sendSecondFactorCode', () => ({
  ...jest.requireActual('./sendSecondFactorCode'),
  sendSecondFactorCode: (...args: unknown[]) =>
    mockSendSecondFactorCode(...args),
}));

const mockConsumeSecondFactorEmailCode = jest.fn();
jest.mock('./secondFactor', () => ({
  ...jest.requireActual('./secondFactor'),
  consumeSecondFactorEmailCode: (...args: unknown[]) =>
    mockConsumeSecondFactorEmailCode(...args),
}));

const TEST_KEY = randomBytes(32).toString('base64');
const USER_ID = '11111111-1111-1111-1111-111111111111';
const EMAIL = 'user@example.com';

interface FakeDb {
  totp: {
    user_id: string;
    /** method=email_otp では NULL */
    encrypted_secret: string | null;
    confirmed_at: string | null;
    last_used_counter: number | null;
    /** 省略時は totp（DB の DEFAULT と同じ） */
    method?: SecondFactorMethod;
    /** 設定を開始した日時。保留行の TTL（#1368）に使う */
    created_at?: string;
  } | null;
  recoveryCodes: Array<{ user_id: string; code_hash: string }>;
}

/**
 * Supabase の模擬
 *
 * 有効化は「設定途中の行だけを更新する」条件付きUPDATEなので、
 * `.is('confirmed_at', null)` を実際に評価する。
 */
function createSupabaseMock(
  db: FakeDb,
  options: { recoveryCodeInsertError?: unknown } = {},
): SupabaseClient {
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
        if (options.recoveryCodeInsertError) {
          return Promise.resolve({ error: options.recoveryCodeInsertError });
        }

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
  jest.clearAllMocks();
  process.env.TOTP_ENCRYPTION_KEY = TEST_KEY;
});

afterAll(() => {
  process.env.TOTP_ENCRYPTION_KEY = originalKey;
});

const emptyDb = (): FakeDb => ({ totp: null, recoveryCodes: [] });

/**
 * 既存行の読み取りだけが失敗する模擬
 *
 * Supabase は「行が無い」ときも「接続断・タイムアウト」のときも
 * `data: null` を返す。区別できるのは `error` だけ
 */
function createReadFailingSupabaseMock(db: FakeDb): {
  client: SupabaseClient;
  deleted: { called: boolean };
} {
  const deleted = { called: false };
  const error = {
    message: 'connection terminated unexpectedly',
    code: '57P01',
  };

  const from = () => {
    const builder: Record<string, unknown> = {};
    const self = () => builder;

    builder.select = jest.fn(self);
    builder.eq = jest.fn(self);
    builder.is = jest.fn(self);
    builder.insert = jest.fn(self);
    builder.update = jest.fn(self);
    builder.delete = jest.fn(() => {
      deleted.called = true;
      db.totp = null;
      return builder;
    });
    builder.maybeSingle = jest.fn(() => Promise.resolve({ data: null, error }));
    (builder as { then: unknown }).then = (
      onFulfilled: (value: unknown) => unknown,
    ) => Promise.resolve({ data: null, error: null }).then(onFulfilled);

    return builder;
  };

  return {
    client: { from: jest.fn(from) } as unknown as SupabaseClient,
    deleted,
  };
}

describe('startSecondFactorSetup（method=totp）', () => {
  /**
   * ⚠️ 読み取りに失敗したときに消してはいけない
   *
   * `existing === null` を「まだ設定していない」と断定すると、
   * 「既に有効化済み」ガードを通過して**無条件 DELETE** に進む。
   * 暗号化済みの共有鍵が失われ、認証アプリの登録が無効になるうえ、
   * 新しい行は confirmed_at が NULL なので当人の2FAが黙って解除される
   */
  it('既存行の読み取りに失敗したら、何も消さずに throw する', async () => {
    const db: FakeDb = {
      totp: {
        user_id: USER_ID,
        encrypted_secret: encryptTotpSecret(generateTotpSecret()),
        confirmed_at: '2026-10-18T00:00:00Z',
        last_used_counter: 5,
      },
      recoveryCodes: [],
    };
    const { client, deleted } = createReadFailingSupabaseMock(db);

    await expect(
      startSecondFactorSetup(
        client,
        USER_ID,
        SECOND_FACTOR_METHOD.TOTP,
        EMAIL,
        EMAIL,
      ),
    ).rejects.toThrow(/connection terminated/);

    expect(deleted.called).toBe(false);
    expect(db.totp).not.toBeNull();
  });

  it('otpauth URI と手入力用の鍵を返す', async () => {
    const result = await startSecondFactorSetup(
      createSupabaseMock(emptyDb()),
      USER_ID,
      SECOND_FACTOR_METHOD.TOTP,
      EMAIL,
      EMAIL,
    );

    expect(result.otpauthUri!).toMatch(/^otpauth:\/\/totp\//);
    expect(result.secret!).toMatch(/^[A-Z2-7]+$/);
  });

  it('URI に含まれる鍵と手入力用の鍵が一致する', async () => {
    // ここがずれると、QRで登録した利用者と手入力した利用者で結果が変わる
    const result = await startSecondFactorSetup(
      createSupabaseMock(emptyDb()),
      USER_ID,
      SECOND_FACTOR_METHOD.TOTP,
      EMAIL,
      EMAIL,
    );

    expect(new URL(result.otpauthUri!).searchParams.get('secret')).toBe(
      result.secret!,
    );
  });

  it('鍵を暗号化して保存する', async () => {
    const db = emptyDb();

    const result = await startSecondFactorSetup(
      createSupabaseMock(db),
      USER_ID,
      SECOND_FACTOR_METHOD.TOTP,
      EMAIL,
      EMAIL,
    );

    expect(db.totp?.encrypted_secret).not.toContain(result.secret!);
    expect(decryptTotpSecret(db.totp!.encrypted_secret as string)).toBe(
      result.secret!,
    );
  });

  it('設定途中として保存する（まだ有効化しない）', async () => {
    // QRを表示しただけで有効にすると、登録に失敗した利用者がロックアウトされる
    const db = emptyDb();

    await startSecondFactorSetup(
      createSupabaseMock(db),
      USER_ID,
      SECOND_FACTOR_METHOD.TOTP,
      EMAIL,
      EMAIL,
    );

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

    const result = await startSecondFactorSetup(
      createSupabaseMock(db),
      USER_ID,
      SECOND_FACTOR_METHOD.TOTP,
      EMAIL,
      EMAIL,
    );

    expect(decryptTotpSecret(db.totp!.encrypted_secret as string)).toBe(
      result.secret!,
    );
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
      startSecondFactorSetup(
        createSupabaseMock(db),
        USER_ID,
        SECOND_FACTOR_METHOD.TOTP,
        EMAIL,
        EMAIL,
      ),
    ).rejects.toThrow('already enabled');
  });

  it('設定どおりのバイト長の鍵を生成する', async () => {
    const result = await startSecondFactorSetup(
      createSupabaseMock(emptyDb()),
      USER_ID,
      SECOND_FACTOR_METHOD.TOTP,
      EMAIL,
      EMAIL,
    );

    expect(base32Decode(result.secret!)).toHaveLength(TOTP_CONFIG.SECRET_BYTES);
  });
});

/**
 * 成功した結果として扱う（型を絞る）
 *
 * ⚠️ `confirmSecondFactorSetup` は期限切れのとき文字列を返す。
 * 成功を見るテストでは、その可能性をここで潰す。
 */
function asSuccess(
  result: Awaited<ReturnType<typeof confirmSecondFactorSetup>>,
) {
  expect(result).not.toBeNull();
  expect(typeof result).not.toBe('string');

  return result as ConfirmSecondFactorSetupResult;
}

describe('confirmSecondFactorSetup', () => {
  /** 設定途中の状態を作る */
  const setupInProgress = () => {
    const secret = generateTotpSecret();
    const db: FakeDb = {
      totp: {
        user_id: USER_ID,
        encrypted_secret: encryptTotpSecret(secret),
        confirmed_at: null,
        last_used_counter: null,
        // ⚠️ 列は NOT NULL。省くと「方式も返す」の検証が undefined で素通りする
        method: SECOND_FACTOR_METHOD.TOTP,
        // ⚠️ 省くと `new Date(undefined)` が NaN になり、保留行の TTL の
        //    比較が常に false へ倒れて**検証をすり抜ける**
        created_at: new Date().toISOString(),
      },
      recoveryCodes: [],
    };
    return { secret, db };
  };

  it('正しいコードで有効化する', async () => {
    const { secret, db } = setupInProgress();

    await confirmSecondFactorSetup(
      createSupabaseMock(db),
      USER_ID,
      generateTotpCode(secret),
      EMAIL,
    );

    expect(db.totp?.confirmed_at).not.toBeNull();
  });

  it('リカバリーコードを発行して返す', async () => {
    const { secret, db } = setupInProgress();

    const result = await confirmSecondFactorSetup(
      createSupabaseMock(db),
      USER_ID,
      generateTotpCode(secret),
      EMAIL,
    );

    expect(asSuccess(result).codes).toHaveLength(RECOVERY_CODE_CONFIG.COUNT);
    expect(db.recoveryCodes).toHaveLength(RECOVERY_CODE_CONFIG.COUNT);
  });

  /**
   * ⛔ **方式も返すこと**（#1368 のレビュー）。有効化の通知に使う。
   *
   * 返さないと呼び出し側が `getSecondFactorMethod` をもう一度呼ぶことになり、
   * **有効化が確定した後ろに throw しうる処理が1つ増える**。500 になると
   * 平文のリカバリーコードを一度も表示できないまま終わる。
   */
  it('有効化した方式も返す', async () => {
    const { secret, db } = setupInProgress();

    const result = await confirmSecondFactorSetup(
      createSupabaseMock(db),
      USER_ID,
      generateTotpCode(secret),
      EMAIL,
    );

    expect(asSuccess(result).method).toBe(SECOND_FACTOR_METHOD.TOTP);
  });

  it('返したコードのハッシュを保存する', async () => {
    const { secret, db } = setupInProgress();

    const result = await confirmSecondFactorSetup(
      createSupabaseMock(db),
      USER_ID,
      generateTotpCode(secret),
      EMAIL,
    );

    asSuccess(result).codes.forEach((code: string) => {
      expect(db.recoveryCodes.map((row) => row.code_hash)).toContain(
        hashRecoveryCode(code),
      );
    });
  });

  /**
   * ⛔ **古い保留行は使わせない**（#1368 のレビュー）。
   *
   * `enable` は `setup` が作った保留行だけを見るため、保留行が無期限に生きると
   * **`setup` の再認証を通り抜けた行を後からいつでも有効化できる**。
   * 再認証を足す前にセッションを奪って `setup` を1回叩いていれば、修正後も
   * そのまま有効化できてしまう。
   */
  it('保留のまま期限を過ぎた行では有効化しない', async () => {
    const { secret, db } = setupInProgress();
    db.totp!.created_at = new Date(
      Date.now() - (TOTP_SETUP_PENDING_TTL_MINUTES + 1) * 60 * 1000,
    ).toISOString();

    await expect(
      confirmSecondFactorSetup(
        createSupabaseMock(db),
        USER_ID,
        generateTotpCode(secret),
        EMAIL,
      ),
    ).resolves.toBe(SECOND_FACTOR_SETUP_EXPIRED);
    // ⚠️ 行ごと消す。残すと `send-challenge` が使えないコードを送り続ける
    expect(db.totp).toBeNull();
  });

  // 期限の内側は通る（短すぎて正規の利用者を締め出していないこと）
  it('期限の内側なら有効化できる', async () => {
    const { secret, db } = setupInProgress();
    db.totp!.created_at = new Date(
      Date.now() - (TOTP_SETUP_PENDING_TTL_MINUTES - 1) * 60 * 1000,
    ).toISOString();

    await expect(
      confirmSecondFactorSetup(
        createSupabaseMock(db),
        USER_ID,
        generateTotpCode(secret),
        EMAIL,
      ),
    ).resolves.not.toBeNull();
  });

  /**
   * ⛔ **リカバリーコードの保存は `confirmed_at` より前**（#1368 の2回目レビュー）。
   *
   * 逆順だと、保存に失敗したときに**二段階認証は有効なのにリカバリーコードが
   * 0件**になる。`replaceRecoveryCodes` は「全件 DELETE → INSERT」なので、
   * INSERT だけ失敗すると DB にも画面にも1件も残らない。認証アプリを失えば
   * 恒久的にロックアウトされる。
   *
   * 逆に、先に保存して確定に失敗した場合は二段階認証が無効のままなので、
   * 使えないコードが残るだけで実害が無い（次の成功時に全件差し替わる）。
   */
  it('リカバリーコードを保存できなければ有効化しない', async () => {
    const { secret, db } = setupInProgress();

    await expect(
      confirmSecondFactorSetup(
        createSupabaseMock(db, {
          recoveryCodeInsertError: { message: 'insert failed' },
        }),
        USER_ID,
        generateTotpCode(secret),
        EMAIL,
      ),
    ).rejects.toThrow();

    // ⛔ ここが本題。有効化が先に通っていると、この行が入ったまま
    //    リカバリーコード0件で二段階認証だけ有効になる
    expect(db.totp?.confirmed_at).toBeNull();
  });

  it('誤ったコードでは有効化しない', async () => {
    const { db } = setupInProgress();

    await expect(
      confirmSecondFactorSetup(
        createSupabaseMock(db),
        USER_ID,
        '000000',
        EMAIL,
      ),
    ).resolves.toBeNull();
    expect(db.totp?.confirmed_at).toBeNull();
  });

  it('誤ったコードではリカバリーコードを発行しない', async () => {
    // 発行してから有効化に失敗すると、使えるコードがあるのに二段階認証は
    // 無効、という中途半端な状態になる
    const { db } = setupInProgress();

    await confirmSecondFactorSetup(
      createSupabaseMock(db),
      USER_ID,
      '000000',
      EMAIL,
    );

    expect(db.recoveryCodes).toHaveLength(0);
  });

  it('設定を開始していなければ null を返す', async () => {
    await expect(
      confirmSecondFactorSetup(
        createSupabaseMock(emptyDb()),
        USER_ID,
        '123456',
        EMAIL,
      ),
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
      confirmSecondFactorSetup(
        createSupabaseMock(db),
        USER_ID,
        generateTotpCode(secret),
        EMAIL,
      ),
    ).resolves.toBeNull();
  });

  it('前後の空白を無視する', async () => {
    const { secret, db } = setupInProgress();

    const result = await confirmSecondFactorSetup(
      createSupabaseMock(db),
      USER_ID,
      `  ${generateTotpCode(secret)} `,
      EMAIL,
    );

    expect(asSuccess(result).codes).toHaveLength(RECOVERY_CODE_CONFIG.COUNT);
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
  /**
   * ⚠️ 削除が失敗したまま挿入に進むと、**旧コードが生き続ける**
   *
   * `verifyRecoveryCode` は `used_at IS NULL` の行を全件突き合わせるため、
   * 消し損ねた旧コードがそのまま通る。「コードが漏れたので再発行する」
   * という最も重要な場面で保護が消えるうえ、ルートは 200 で
   * 「以前のコードはすべて使えなくなります」と答えてしまう
   */
  it('削除に失敗したら、新しいコードを入れずに throw する', async () => {
    const db: FakeDb = {
      totp: null,
      recoveryCodes: [{ user_id: USER_ID, code_hash: 'old-hash' }],
    };
    const inserted: string[] = [];

    const client = {
      from: jest.fn(() => {
        const builder: Record<string, unknown> = {};
        const self = () => builder;
        builder.eq = jest.fn(self);
        builder.delete = jest.fn(() => {
          // 削除は失敗する（＝旧コードが残る）
          (builder as { then: unknown }).then = (
            onFulfilled: (value: unknown) => unknown,
          ) =>
            Promise.resolve({
              data: null,
              error: { message: 'deadlock detected', code: '40P01' },
            }).then(onFulfilled);
          return builder;
        });
        builder.insert = jest.fn((rows: Array<{ code_hash: string }>) => {
          inserted.push(...rows.map((row) => row.code_hash));
          return builder;
        });
        (builder as { then: unknown }).then = (
          onFulfilled: (value: unknown) => unknown,
        ) => Promise.resolve({ data: null, error: null }).then(onFulfilled);
        return builder;
      }),
    } as unknown as SupabaseClient;

    await expect(regenerateRecoveryCodes(client, USER_ID)).rejects.toThrow(
      /deadlock detected/,
    );

    expect(inserted).toHaveLength(0);
    expect(db.recoveryCodes).toEqual([
      { user_id: USER_ID, code_hash: 'old-hash' },
    ]);
  });

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

// -------------------- メールOTP 方式の設定 --------------------

describe('startSecondFactorSetup（method=email_otp）', () => {
  beforeEach(() => {
    mockSendSecondFactorCode.mockResolvedValue('sent');
  });

  /**
   * ⚠️ `method` を省くと DB の DEFAULT 'totp' が入り、`encrypted_secret` が
   * NULL なので `chk_secret_matches_method` に 23514 で落ちる。
   */
  it('method と encrypted_secret: null を明示して保存する', async () => {
    const db = emptyDb();

    await startSecondFactorSetup(
      createSupabaseMock(db),
      USER_ID,
      SECOND_FACTOR_METHOD.EMAIL_OTP,
      EMAIL,
      EMAIL,
    );

    expect(db.totp?.method).toBe(SECOND_FACTOR_METHOD.EMAIL_OTP);
    expect(db.totp?.encrypted_secret).toBeNull();
  });

  it('共有鍵もQRも作らず、コードを送る', async () => {
    // ⚠️ `accountName`（認証アプリの表示名）と `email`（送信先）に
    // **別の値**を渡す（#1287）。両方に EMAIL を渡していた頃は、実装が
    // 引数を取り違えても落ちなかった。送信先は #641 のベクタそのものなので、
    // どちらの値が使われたかを区別できる状態にしておく
    const result = await startSecondFactorSetup(
      createSupabaseMock(emptyDb()),
      USER_ID,
      SECOND_FACTOR_METHOD.EMAIL_OTP,
      'display-name@example.com',
      EMAIL,
    );

    expect(result.otpauthUri).toBeUndefined();
    expect(result.secret).toBeUndefined();
    expect(result.sendResult).toBe('sent');
    expect(mockSendSecondFactorCode).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      EMAIL,
    );
  });

  it('method=totp ではコードを送らない', async () => {
    await startSecondFactorSetup(
      createSupabaseMock(emptyDb()),
      USER_ID,
      SECOND_FACTOR_METHOD.TOTP,
      EMAIL,
      EMAIL,
    );

    expect(mockSendSecondFactorCode).not.toHaveBeenCalled();
  });

  it('既に有効なら方式によらず TotpAlreadyEnabledError', async () => {
    const db = emptyDb();
    db.totp = {
      user_id: USER_ID,
      encrypted_secret: encryptTotpSecret(generateTotpSecret()),
      confirmed_at: '2026-11-18T00:00:00Z',
      last_used_counter: null,
    };

    await expect(
      startSecondFactorSetup(
        createSupabaseMock(db),
        USER_ID,
        SECOND_FACTOR_METHOD.EMAIL_OTP,
        EMAIL,
        EMAIL,
      ),
    ).rejects.toThrow(TotpAlreadyEnabledError);
  });

  /**
   * ⚠️ `SEND_FAILED` では `sendSecondFactorCode` が otp_codes の行も消して
   * いるので、使えるコードが1つも無い。設定途中の行を残すと
   * 「コード入力画面に来たのにコードが来ない」状態になる。
   */
  it('送信に失敗したら設定途中の行を残さない', async () => {
    mockSendSecondFactorCode.mockResolvedValue('send_failed');
    const db = emptyDb();

    const result = await startSecondFactorSetup(
      createSupabaseMock(db),
      USER_ID,
      SECOND_FACTOR_METHOD.EMAIL_OTP,
      EMAIL,
      EMAIL,
    );

    // ⚠️ sendResult はモックの戻り値を読み返すだけで、保証にはならない（#1287）。
    // 呼び出し側（route）へ素通しすることだけを固定している
    expect(result.sendResult).toBe('send_failed');
    // こちらが本体。SEND_FAILED では otp_codes の行も消えているので、
    // 設定途中の行を残すと「コード入力画面に来たのにコードが来ない」になる
    expect(db.totp).toBeNull();
  });

  /**
   * ⚠️ 逆に `THROTTLED` では**直前に送ったコードがまだ生きている**。
   * ここで行を消すと、受信箱にあるコードを入力できなくなる。
   */
  it('再送間隔に当たった場合は設定途中の行を残す', async () => {
    mockSendSecondFactorCode.mockResolvedValue('throttled');
    const db = emptyDb();

    const result = await startSecondFactorSetup(
      createSupabaseMock(db),
      USER_ID,
      SECOND_FACTOR_METHOD.EMAIL_OTP,
      EMAIL,
      EMAIL,
    );

    expect(result.sendResult).toBe('throttled');
    // こちらが本体。直前に送ったコードがまだ生きているので、行を消すと
    // 受信箱にあるコードを入力できなくなる
    expect(db.totp).not.toBeNull();
  });

  it('送信上限に当たった場合も設定途中の行を残す', async () => {
    mockSendSecondFactorCode.mockResolvedValue('limit_exceeded');
    const db = emptyDb();

    await startSecondFactorSetup(
      createSupabaseMock(db),
      USER_ID,
      SECOND_FACTOR_METHOD.EMAIL_OTP,
      EMAIL,
      EMAIL,
    );

    expect(db.totp).not.toBeNull();
  });
});

describe('confirmSecondFactorSetup（method=email_otp）', () => {
  /** メールOTP で設定途中の状態を作る */
  const emailSetupInProgress = () => {
    const db = emptyDb();
    db.totp = {
      user_id: USER_ID,
      encrypted_secret: null as unknown as string,
      confirmed_at: null,
      last_used_counter: null,
      method: SECOND_FACTOR_METHOD.EMAIL_OTP,
      // ⚠️ 省くと `new Date(undefined)` が NaN になり、保留行の TTL の
      //    比較が常に false へ倒れて**この describe 全体が検証をすり抜ける**
      //    （#1368 の2回目レビューで実測）
      created_at: new Date().toISOString(),
    } as FakeDb['totp'];
    return db;
  };

  beforeEach(() => {
    mockConsumeSecondFactorEmailCode.mockResolvedValue('success');
  });

  /**
   * ⚠️ 設定途中は `confirmed_at` が NULL なので `getSecondFactorMethod` は
   * null を返す。`verifySecondFactor` 経由では到達できないため、
   * `consumeSecondFactorEmailCode` を直接使う。
   */
  it('メールのコードで有効化し、リカバリーコードを返す', async () => {
    const db = emailSetupInProgress();

    const result = await confirmSecondFactorSetup(
      createSupabaseMock(db),
      USER_ID,
      '123456',
      EMAIL,
    );

    expect(asSuccess(result).codes).toHaveLength(RECOVERY_CODE_CONFIG.COUNT);
    // ⛔ メールOTP でも方式を返す（#1368 のレビュー）
    expect(asSuccess(result).method).toBe(SECOND_FACTOR_METHOD.EMAIL_OTP);
    expect(db.totp?.confirmed_at).not.toBeNull();
    expect(mockConsumeSecondFactorEmailCode).toHaveBeenCalledWith(
      expect.anything(),
      EMAIL,
      '123456',
    );
  });

  // TTL は方式によらず効く（#1368 の2回目レビュー）
  it('保留のまま期限を過ぎた行では有効化しない', async () => {
    const db = emailSetupInProgress();
    db.totp!.created_at = new Date(
      Date.now() - (TOTP_SETUP_PENDING_TTL_MINUTES + 1) * 60 * 1000,
    ).toISOString();

    await expect(
      confirmSecondFactorSetup(
        createSupabaseMock(db),
        USER_ID,
        '123456',
        EMAIL,
      ),
    ).resolves.toBe(SECOND_FACTOR_SETUP_EXPIRED);
    // ⚠️ 行ごと消す。残すと `send-challenge` が使えないコードを送り続ける
    expect(db.totp).toBeNull();
    // 期限切れなら照合そのものを行わない（コードを無駄に消費しない）
    expect(mockConsumeSecondFactorEmailCode).not.toHaveBeenCalled();
  });

  it('コードが合わなければ null を返し、有効化もしない', async () => {
    mockConsumeSecondFactorEmailCode.mockResolvedValue('invalid');
    const db = emailSetupInProgress();

    await expect(
      confirmSecondFactorSetup(
        createSupabaseMock(db),
        USER_ID,
        '999999',
        EMAIL,
      ),
    ).resolves.toBeNull();

    expect(db.totp?.confirmed_at).toBeNull();
    expect(db.recoveryCodes).toHaveLength(0);
  });

  it('method=totp ではメールのコードを使わない', async () => {
    const db = emptyDb();
    const secret = generateTotpSecret();
    db.totp = {
      user_id: USER_ID,
      encrypted_secret: encryptTotpSecret(secret),
      confirmed_at: null,
      last_used_counter: null,
    };

    await confirmSecondFactorSetup(
      createSupabaseMock(db),
      USER_ID,
      generateTotpCode(secret),
      EMAIL,
    );

    expect(mockConsumeSecondFactorEmailCode).not.toHaveBeenCalled();
  });
});
