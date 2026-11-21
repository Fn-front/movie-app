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
  SECOND_FACTOR_METHOD,
  TWO_FACTOR_OTP_ACTION,
  type SecondFactorMethod,
} from '@/constants/secondFactor';
import { hashOtpCode } from '@/lib/otp/hashOtpCode';
import { TOTP_SETUP_PENDING_TTL_MINUTES } from '@/constants/totp';

import {
  countUnusedRecoveryCodes,
  getSecondFactorMethod,
  getSecondFactorMethodIncludingPending,
  getSecondFactorSetupState,
  SECOND_FACTOR_VERIFY_RESULT,
  verifySecondFactor,
} from './secondFactor';

// hashOtpCode は pepper が無いと例外を投げる（平文フォールバック禁止）
process.env.OTP_HASH_PEPPER = 'test-pepper-value';

const TEST_KEY = randomBytes(32).toString('base64');
const USER_ID = '11111111-1111-1111-1111-111111111111';

/** 1件の user_totp 行と、未使用リカバリーコードを保持する最小のDB模擬 */
interface FakeDb {
  totp: {
    encrypted_secret: string;
    confirmed_at: string | null;
    last_used_counter: number | null;
    /** 省略時は 'totp'（DB の DEFAULT と同じ） */
    method?: SecondFactorMethod;
    /**
     * 設定を開始した日時
     *
     * ⚠️ **省かないこと。** `new Date(undefined)` は NaN になり、保留行の
     * TTL（#1368）の比較が常に false へ倒れて検証をすり抜ける。
     * 本番の列は NOT NULL DEFAULT now()。
     */
    created_at?: string;
  } | null;
  recoveryCodes: Array<{
    id: string;
    code_hash: string;
    used_at: string | null;
  }>;
  /** `users` の1行。メールOTP の宛先解決に使う */
  user?: { email: string } | null;
  /** `otp_codes` の行（action_type='two_factor'） */
  otpCodes?: Array<{
    id: string;
    email: string;
    action_type: string;
    code_hash: string;
    attempts: number;
    expires_at: string;
    created_at: string;
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
      action: 'select' | 'update' | 'delete';
      payload: Record<string, unknown>;
      requireUnusedCounter: number | null;
      requireUnusedAt: boolean;
      requireConfirmed: boolean;
      matchedId: string | null;
      /** `.eq(column, value)` をそのまま保持して resolve で評価する */
      eqs: Record<string, unknown>;
      /** `.gt(column, value)` — 期限チェックの評価に使う */
      gt: { column: string; value: string } | null;
    } = {
      action: 'select',
      payload: {},
      requireUnusedCounter: null,
      requireUnusedAt: false,
      requireConfirmed: false,
      matchedId: null,
      eqs: {},
      gt: null,
    };

    const builder: Record<string, unknown> = {};

    builder.select = jest.fn(() => builder);
    builder.eq = jest.fn((column: string, value: unknown) => {
      if (column === 'id') state.matchedId = value as string;
      state.eqs[column] = value;
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
    builder.gt = jest.fn((column: string, value: string) => {
      state.gt = { column, value };
      return builder;
    });
    builder.order = jest.fn(() => builder);
    builder.limit = jest.fn(() => builder);
    builder.update = jest.fn((payload: Record<string, unknown>) => {
      state.action = 'update';
      state.payload = payload;
      return builder;
    });
    builder.delete = jest.fn(() => {
      state.action = 'delete';
      return builder;
    });

    /** `otp_codes` から state の条件に合う行を引く */
    const matchingOtpCodes = () =>
      (db.otpCodes ?? []).filter((row) => {
        for (const [column, value] of Object.entries(state.eqs)) {
          if ((row as unknown as Record<string, unknown>)[column] !== value) {
            return false;
          }
        }
        // ⚠️ 期限を実際に評価する。ここを素通りさせると、実装から
        // `.gt('expires_at', now)` を消してもテストが緑のままになる
        if (state.gt && state.gt.column === 'expires_at') {
          if (!(row.expires_at > state.gt.value)) return false;
        }
        return true;
      });

    const singleResult = () => {
      if (table === 'user_totp') {
        if (!db.totp) return { data: null };
        if (state.requireConfirmed && !db.totp.confirmed_at) {
          return { data: null };
        }
        // method を省いた fixture は DB の DEFAULT と同じく totp として扱う
        return {
          data: {
            ...db.totp,
            method: db.totp.method ?? SECOND_FACTOR_METHOD.TOTP,
          },
        };
      }

      if (table === 'users') {
        return db.user ? { data: db.user } : { data: null };
      }

      if (table === 'otp_codes') {
        const rows = matchingOtpCodes();
        return { data: rows[0] ?? null };
      }

      return { data: null };
    };

    builder.maybeSingle = jest.fn(() => Promise.resolve(singleResult()));
    builder.single = jest.fn(() => Promise.resolve(singleResult()));

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

      if (table === 'otp_codes' && state.action === 'delete') {
        const matched = matchingOtpCodes();
        db.otpCodes = (db.otpCodes ?? []).filter((r) => !matched.includes(r));
        return { data: matched.map((r) => ({ id: r.id })) };
      }

      if (table === 'otp_codes' && state.action === 'update') {
        const row = (db.otpCodes ?? []).find((r) => r.id === state.matchedId);
        if (!row) return { data: [] };

        Object.assign(row, state.payload);
        return { data: [{ id: row.id }] };
      }

      if (table === 'otp_codes') {
        return { data: matchingOtpCodes() };
      }

      return { data: null };
    };

    (builder as { then: unknown }).then = (
      onFulfilled: (value: unknown) => unknown,
    ) => Promise.resolve(resolve()).then(onFulfilled);

    return builder;
  };

  /**
   * `increment_otp_attempts` RPC（#1284）
   *
   * ⚠️ **行を実際に書き換える。** 呼ばれたことだけを見ると、加算を
   * やめる変異が素通りする。read-then-write に戻す変異も、ここで
   * 値が動くからこそ検知できる。
   */
  const rpc = jest.fn((name: string, args: Record<string, unknown>) => {
    if (name !== 'increment_otp_attempts') {
      return Promise.resolve({ data: null, error: null });
    }

    const row = db.otpCodes?.find((r) => r.id === args.p_id);

    if (!row) return Promise.resolve({ data: 5, error: null });

    row.attempts = Math.min(row.attempts + 1, 5);

    return Promise.resolve({ data: row.attempts, error: null });
  });

  return { from: jest.fn(from), rpc } as unknown as SupabaseClient;
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

describe('getSecondFactorMethod', () => {
  it('確認済みの行があれば、その方式を返す', async () => {
    const db: FakeDb = {
      totp: {
        encrypted_secret: encryptTotpSecret(generateTotpSecret()),
        confirmed_at: '2026-10-18T00:00:00Z',
        last_used_counter: null,
      },
      recoveryCodes: [],
    };

    await expect(
      getSecondFactorMethod(createSupabaseMock(db), USER_ID),
    ).resolves.toBe(SECOND_FACTOR_METHOD.TOTP);
  });

  it('メールOTP の行なら email_otp を返す', async () => {
    const db: FakeDb = {
      totp: {
        // method=email_otp では DB 側も NULL だが、模擬の型都合で空文字を置く
        encrypted_secret: '',
        confirmed_at: '2026-11-18T00:00:00Z',
        last_used_counter: null,
        method: SECOND_FACTOR_METHOD.EMAIL_OTP,
        created_at: '2026-11-18T00:00:00Z',
      },
      recoveryCodes: [],
    };

    await expect(
      getSecondFactorMethod(createSupabaseMock(db), USER_ID),
    ).resolves.toBe(SECOND_FACTOR_METHOD.EMAIL_OTP);
  });

  it('設定途中（confirmed_at が NULL）は null', async () => {
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

    await expect(
      getSecondFactorMethod(createSupabaseMock(db), USER_ID),
    ).resolves.toBeNull();
  });

  it('行が無ければ null', async () => {
    const db: FakeDb = { totp: null, recoveryCodes: [] };

    await expect(
      getSecondFactorMethod(createSupabaseMock(db), USER_ID),
    ).resolves.toBeNull();
  });

  /**
   * ⚠️ ここが null に倒れると**第2要素が丸ごと飛ぶ**
   *
   * `auth.ts` のログイン3経路（パスワード / OTP / OAuth）はいずれも
   * 「有効なら止める」側のガードなので、null は素通りを意味する。
   * DB の不調だけで 7日間有効なセッションが発行されてしまう
   */
  it('DB エラーなら throw する（未設定として扱わない）', async () => {
    await expect(
      getSecondFactorMethod(createFailingSupabaseMock(), USER_ID),
    ).rejects.toThrow(/connection terminated/);
  });
});

/**
 * 設定途中も含めて方式を返す（#1285）
 *
 * `user/totp/send-challenge` だけがこちらを使う。設定中の再送を
 * `setup` の叩き直しでやると `TOTP_SETTINGS_VERIFY`（5回/15分）を
 * 消費し、4回再送しただけで「有効にする」が 429 になる。
 *
 * ⛔ ログインのガードには使わない（そちらは `getSecondFactorMethod`）。
 */
describe('getSecondFactorMethodIncludingPending', () => {
  it('設定途中（confirmed_at が NULL）でも方式を返す', async () => {
    const db: FakeDb = {
      totp: {
        encrypted_secret: '',
        confirmed_at: null,
        last_used_counter: null,
        method: SECOND_FACTOR_METHOD.EMAIL_OTP,
        created_at: new Date().toISOString(),
      },
      recoveryCodes: [],
    };

    await expect(
      getSecondFactorMethodIncludingPending(createSupabaseMock(db), USER_ID),
    ).resolves.toBe(SECOND_FACTOR_METHOD.EMAIL_OTP);
  });

  /**
   * ⛔ **期限を過ぎた保留行は「無い」ものとして扱う**（#1368 の2回目レビュー）。
   *
   * `confirmSecondFactorSetup` は TTL を過ぎた保留行を拒否する。ここが
   * それを知らないと、`send-challenge` が**使えないコードを送り続ける**。
   * 届いたばかりの正しいコードが「認証コードが正しくありません」になり、
   * 利用者は再送と入力を繰り返して `TOTP_SETTINGS_VERIFY` を使い切る。
   */
  it('期限を過ぎた設定途中の行は null', async () => {
    const db: FakeDb = {
      totp: {
        encrypted_secret: '',
        confirmed_at: null,
        last_used_counter: null,
        method: SECOND_FACTOR_METHOD.EMAIL_OTP,
        created_at: new Date(
          Date.now() - (TOTP_SETUP_PENDING_TTL_MINUTES + 1) * 60 * 1000,
        ).toISOString(),
      },
      recoveryCodes: [],
    };

    await expect(
      getSecondFactorMethodIncludingPending(createSupabaseMock(db), USER_ID),
    ).resolves.toBeNull();
  });

  /**
   * ⚠️ **確認済みの行には TTL を当てない。** 当てると、設定から60分経った
   * 利用者の二段階認証が「未設定」に化けて `send-challenge` が使えなくなる。
   */
  it('確認済みなら古くても方式を返す', async () => {
    const db: FakeDb = {
      totp: {
        encrypted_secret: '',
        confirmed_at: '2026-01-01T00:00:00Z',
        last_used_counter: null,
        method: SECOND_FACTOR_METHOD.EMAIL_OTP,
        created_at: '2026-01-01T00:00:00Z',
      },
      recoveryCodes: [],
    };

    await expect(
      getSecondFactorMethodIncludingPending(createSupabaseMock(db), USER_ID),
    ).resolves.toBe(SECOND_FACTOR_METHOD.EMAIL_OTP);
  });

  it('確認済みの行でも方式を返す', async () => {
    const db: FakeDb = {
      totp: {
        encrypted_secret: '',
        confirmed_at: '2026-11-18T00:00:00Z',
        last_used_counter: null,
        method: SECOND_FACTOR_METHOD.EMAIL_OTP,
        created_at: '2026-11-18T00:00:00Z',
      },
      recoveryCodes: [],
    };

    await expect(
      getSecondFactorMethodIncludingPending(createSupabaseMock(db), USER_ID),
    ).resolves.toBe(SECOND_FACTOR_METHOD.EMAIL_OTP);
  });

  it('行が無ければ null', async () => {
    const db: FakeDb = { totp: null, recoveryCodes: [] };

    await expect(
      getSecondFactorMethodIncludingPending(createSupabaseMock(db), USER_ID),
    ).resolves.toBeNull();
  });

  it('DB エラーなら throw する（未設定として扱わない）', async () => {
    await expect(
      getSecondFactorMethodIncludingPending(
        createFailingSupabaseMock(),
        USER_ID,
      ),
    ).rejects.toThrow(/connection terminated/);
  });

  /**
   * ⛔ **「未設定」と「期限切れ」を区別する**（#1368 の3回目レビュー）。
   *
   * `send-challenge` は文言を出し分けるためにこのフラグを見る。区別が
   * 無いと、設定中の画面に「二段階認証が設定されていません。」が出る。
   */
  describe('getSecondFactorSetupState', () => {
    const buildDb = (overrides: Partial<NonNullable<FakeDb['totp']>>) => ({
      totp: {
        encrypted_secret: '',
        confirmed_at: null,
        last_used_counter: null,
        method: SECOND_FACTOR_METHOD.EMAIL_OTP,
        created_at: new Date().toISOString(),
        ...overrides,
      },
      recoveryCodes: [],
    });

    it('期限内の保留行は pendingExpired にしない', async () => {
      await expect(
        getSecondFactorSetupState(createSupabaseMock(buildDb({})), USER_ID),
      ).resolves.toEqual({
        method: SECOND_FACTOR_METHOD.EMAIL_OTP,
        pendingExpired: false,
      });
    });

    it('期限切れの保留行は pendingExpired を立てる', async () => {
      const db = buildDb({
        created_at: new Date(
          Date.now() - (TOTP_SETUP_PENDING_TTL_MINUTES + 1) * 60 * 1000,
        ).toISOString(),
      });

      await expect(
        getSecondFactorSetupState(createSupabaseMock(db), USER_ID),
      ).resolves.toEqual({ method: null, pendingExpired: true });
    });

    /** ⚠️ 行が無いのは「未設定」。期限切れと混ぜない */
    it('行が無ければ pendingExpired は false', async () => {
      await expect(
        getSecondFactorSetupState(
          createSupabaseMock({ totp: null, recoveryCodes: [] }),
          USER_ID,
        ),
      ).resolves.toEqual({ method: null, pendingExpired: false });
    });
  });
});

describe('verifySecondFactor（DB エラー）', () => {
  // 現状は NOT_ENABLED / INVALID（＝拒否側）に倒れるので直ちに危険では
  // ないが、障害が「未設定」「コード違い」に化けて切り分けができない
  it('認証アプリのコードの検証中に DB エラーなら throw する', async () => {
    await expect(
      verifySecondFactor(createFailingSupabaseMock(), USER_ID, '123456'),
    ).rejects.toThrow(/connection terminated/);
  });

  it('リカバリーコードの検証中に DB エラーなら throw する', async () => {
    await expect(
      verifySecondFactor(createFailingSupabaseMock(), USER_ID, 'AAAAA-BBBBB'),
    ).rejects.toThrow(/connection terminated/);
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
    ).resolves.toBe(SECOND_FACTOR_VERIFY_RESULT.SUCCESS);
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
    ).resolves.toBe(SECOND_FACTOR_VERIFY_RESULT.INVALID);
  });

  it('同じコードの2回目を拒否する', async () => {
    const db = makeDb();
    const supabase = createSupabaseMock(db);
    const code = generateTotpCode(secret);

    await expect(verifySecondFactor(supabase, USER_ID, code)).resolves.toBe(
      SECOND_FACTOR_VERIFY_RESULT.SUCCESS,
    );
    await expect(verifySecondFactor(supabase, USER_ID, code)).resolves.toBe(
      SECOND_FACTOR_VERIFY_RESULT.REUSED,
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
    ).resolves.toBe(SECOND_FACTOR_VERIFY_RESULT.REUSED);
  });

  it('前後の空白を無視する', async () => {
    const db = makeDb();

    await expect(
      verifySecondFactor(
        createSupabaseMock(db),
        USER_ID,
        `  ${generateTotpCode(secret)} `,
      ),
    ).resolves.toBe(SECOND_FACTOR_VERIFY_RESULT.SUCCESS);
  });

  it('二段階認証が有効でなければ not_enabled', async () => {
    const db: FakeDb = { totp: null, recoveryCodes: [] };

    await expect(
      verifySecondFactor(createSupabaseMock(db), USER_ID, '123456'),
    ).resolves.toBe(SECOND_FACTOR_VERIFY_RESULT.NOT_ENABLED);
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
    ).resolves.toBe(SECOND_FACTOR_VERIFY_RESULT.NOT_ENABLED);
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
    ).resolves.toBe(SECOND_FACTOR_VERIFY_RESULT.SUCCESS);
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
      SECOND_FACTOR_VERIFY_RESULT.SUCCESS,
    );
    await expect(verifySecondFactor(supabase, USER_ID, codes[0])).resolves.toBe(
      SECOND_FACTOR_VERIFY_RESULT.INVALID,
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
    ).resolves.toBe(SECOND_FACTOR_VERIFY_RESULT.SUCCESS);
  });

  it('存在しないリカバリーコードを拒否する', async () => {
    const { db } = buildDb();

    await expect(
      verifySecondFactor(createSupabaseMock(db), USER_ID, 'ZZZZZ-ZZZZZ'),
    ).resolves.toBe(SECOND_FACTOR_VERIFY_RESULT.INVALID);
  });

  it('コードを使い切っていたら拒否する', async () => {
    const { codes, db } = buildDb();
    db.recoveryCodes.forEach((row) => {
      row.used_at = '2026-10-18T00:00:00Z';
    });

    await expect(
      verifySecondFactor(createSupabaseMock(db), USER_ID, codes[0]),
    ).resolves.toBe(SECOND_FACTOR_VERIFY_RESULT.INVALID);
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

// -------------------- メールOTP（method = email_otp） --------------------

const EMAIL = 'user@example.com';

/** 有効な第2要素コードの行を1件持つ DB を組み立てる */
const emailOtpDb = (
  code: string,
  overrides: Partial<{ attempts: number; expiresAt: string }> = {},
): FakeDb => ({
  totp: {
    // method=email_otp では DB 上 NULL。模擬の型都合で空文字を置く
    encrypted_secret: '',
    confirmed_at: '2026-11-18T00:00:00Z',
    last_used_counter: null,
    method: SECOND_FACTOR_METHOD.EMAIL_OTP,
  },
  recoveryCodes: [],
  user: { email: EMAIL },
  otpCodes: [
    {
      id: 'otp-1',
      email: EMAIL,
      action_type: TWO_FACTOR_OTP_ACTION,
      code_hash: hashOtpCode(code, EMAIL),
      attempts: overrides.attempts ?? 0,
      expires_at: overrides.expiresAt ?? '2099-01-01T00:00:00.000Z',
      created_at: '2026-11-18T00:00:00.000Z',
    },
  ],
});

describe('verifySecondFactor（method = email_otp）', () => {
  it('期限内の一致するコードで SUCCESS を返し、行を消す', async () => {
    const db = emailOtpDb('123456');

    await expect(
      verifySecondFactor(createSupabaseMock(db), USER_ID, '123456'),
    ).resolves.toBe(SECOND_FACTOR_VERIFY_RESULT.SUCCESS);

    expect(db.otpCodes).toHaveLength(0);
  });

  /**
   * ⚠️ 期限はDB制約では強制されていない。chk_otp_attempts は attempts の
   * ドメイン制約にすぎず、期限の判定はルートコード側にしかない。
   * 実装から expires_at の比較を落としても気づけるよう、結果だけでなく
   * **行が残っていること**も確かめる。
   */
  it('期限切れのコードは通らず、行も消えない', async () => {
    const db = emailOtpDb('123456', { expiresAt: '2000-01-01T00:00:00.000Z' });

    await expect(
      verifySecondFactor(createSupabaseMock(db), USER_ID, '123456'),
    ).resolves.toBe(SECOND_FACTOR_VERIFY_RESULT.INVALID);

    expect(db.otpCodes).toHaveLength(1);
  });

  it('一致しないコードは INVALID で、行も消えない', async () => {
    const db = emailOtpDb('123456');

    await expect(
      verifySecondFactor(createSupabaseMock(db), USER_ID, '999999'),
    ).resolves.toBe(SECOND_FACTOR_VERIFY_RESULT.INVALID);

    expect(db.otpCodes).toHaveLength(1);
  });

  it('不一致なら attempts が1増える', async () => {
    const db = emailOtpDb('123456');

    await verifySecondFactor(createSupabaseMock(db), USER_ID, '999999');

    expect(db.otpCodes?.[0].attempts).toBe(1);
  });

  /**
   * ⛔ **read-then-write で書き戻さない**（#1284）。
   *
   * N 並列だと全員が同じ `attempts` を読んで同じ値を書くため、
   * **0→1 が N 回**起きるだけになり、5回上限が機能しない。
   *
   * ⚠️ 値が増えたことだけを見ても足りない。模擬の UPDATE も値を動かすので、
   * **RPC を通ったこと**と**直接 UPDATE していないこと**の両方を見る。
   */
  it('加算は RPC で行う（直接 UPDATE しない）', async () => {
    const db = emailOtpDb('123456');
    const client = createSupabaseMock(db);
    const rpc = client.rpc as unknown as jest.Mock;
    const from = client.from as unknown as jest.Mock;

    await verifySecondFactor(client, USER_ID, '999999');

    expect(rpc).toHaveBeenCalledWith('increment_otp_attempts', {
      p_id: db.otpCodes![0].id,
    });

    // `from('otp_codes')` のチェーンに update が現れていないこと
    const usedUpdate = from.mock.results.some((result) => {
      const builder = result.value as { update?: unknown } | undefined;

      return (
        typeof builder?.update === 'function' &&
        (builder.update as jest.Mock).mock?.calls?.length > 0
      );
    });

    expect(usedUpdate).toBe(false);
  });

  // 同時に投げられても取りこぼさない
  it('同時に投げられても加算が失われない', async () => {
    const db = emailOtpDb('123456');
    const client = createSupabaseMock(db);

    await Promise.all(
      Array.from({ length: 3 }, () =>
        verifySecondFactor(client, USER_ID, '999999'),
      ),
    );

    expect(db.otpCodes?.[0].attempts).toBe(3);
  });

  /**
   * ⚠️ 試行上限もルートコード側でしか強制されていない。attempts を直接
   * 与えるのではなく**5回失敗させてから**6回目を見ることで、加算と上限の
   * 両方が実装されていることを確かめる。
   *
   * 加算を止めないと6回目で chk_otp_attempts（0〜5）に当たって 23514 で
   * 落ちる。エラーを見ないと静かにカウントが止まる。
   */
  it('5回失敗した後は、正しいコードでも照合に進まない', async () => {
    const db = emailOtpDb('123456');
    const supabase = createSupabaseMock(db);

    for (let i = 0; i < 5; i += 1) {
      await verifySecondFactor(supabase, USER_ID, '999999');
    }

    expect(db.otpCodes?.[0].attempts).toBe(5);

    await expect(verifySecondFactor(supabase, USER_ID, '123456')).resolves.toBe(
      SECOND_FACTOR_VERIFY_RESULT.INVALID,
    );

    // 照合に進んでいれば行が消えている
    expect(db.otpCodes).toHaveLength(1);
    // 上限を超えて加算していない（超えると 23514 で落ちる）
    expect(db.otpCodes?.[0].attempts).toBe(5);
  });

  it('同じコードの2回目は INVALID（削除行数で判定している）', async () => {
    const db = emailOtpDb('123456');
    const supabase = createSupabaseMock(db);

    await verifySecondFactor(supabase, USER_ID, '123456');

    await expect(verifySecondFactor(supabase, USER_ID, '123456')).resolves.toBe(
      SECOND_FACTOR_VERIFY_RESULT.INVALID,
    );
  });

  it('コードが1件も無ければ INVALID', async () => {
    const db = emailOtpDb('123456');
    db.otpCodes = [];

    await expect(
      verifySecondFactor(createSupabaseMock(db), USER_ID, '123456'),
    ).resolves.toBe(SECOND_FACTOR_VERIFY_RESULT.INVALID);
  });

  /**
   * リカバリーコードは方式に依存しない。RECOVERY_CODE_PATTERN は
   * [2-9A-HJKMNP-TWXYZ]{10} で、6桁の数字とは長さも文字種も交わらない。
   */
  it('リカバリーコードはメールOTP の利用者でも使える', async () => {
    const generated = generateRecoveryCodes();
    const db = emailOtpDb('123456');
    db.recoveryCodes = generated.hashes.map((hash, index) => ({
      id: `recovery-${index}`,
      code_hash: hash,
      used_at: null,
    }));

    await expect(
      verifySecondFactor(createSupabaseMock(db), USER_ID, generated.codes[0]),
    ).resolves.toBe(SECOND_FACTOR_VERIFY_RESULT.SUCCESS);
  });
});
