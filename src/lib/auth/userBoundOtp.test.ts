/**
 * @jest-environment node
 */

/**
 * 利用者に紐づく確認コード（#1362 / #1368）
 *
 * ⚠️ **モックは積まれた条件で実際に行を絞る。**
 *
 * 固定の行を返すモックだと、`WHERE` から条件を1つ落としても通る。
 * #1359 のレビューでは `user_id` の条件落ちが**2件とも素通り**した。
 *
 * ⛔ 最重要は **`user_id` と `action_type` の両方を照合条件に含めること**。
 * `user_id` が無いと攻撃者のコードを被害者のセッションで使え、
 * `action_type` が無いと**別の用途のコードで通る**（退会のコードで
 * 二段階認証を設定できる、など）。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { ACCOUNT_DELETE_OTP_ACTION } from '@/constants/accountDeleteCode';
import { OTP_CONFIG } from '@/constants/otp';
import { SECOND_FACTOR_SETUP_OTP_ACTION } from '@/constants/secondFactorSetupCode';

// --- Mocks ---

const mockSendOtpEmail = jest.fn();
jest.mock('@/lib/otp', () => ({
  generateOtpCode: () => '123456',
  // ⚠️ 塩（第2引数）を含める。含めないと塩の取り違えを検知できない
  hashOtpCode: (code: string, salt: string) => `${code}#${salt}`,
  sendOtpEmail: (...args: unknown[]) => mockSendOtpEmail(...args),
}));

import {
  SEND_USER_BOUND_OTP_RESULT,
  USER_BOUND_OTP_VERIFY_RESULT,
  consumeUserBoundOtp,
  sendUserBoundOtp,
} from './userBoundOtp';

// --- Helpers ---

const USER_ID = 'user-1';
const EMAIL = 'owner@example.com';
const ACTION = SECOND_FACTOR_SETUP_OTP_ACTION;

/** otp_codes の1行 */
interface StoredRow {
  id: string;
  user_id: string;
  email: string;
  action_type: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
  created_at: string;
}

function storedRow(overrides: Partial<StoredRow> = {}): StoredRow {
  return {
    id: 'row-1',
    user_id: USER_ID,
    email: EMAIL,
    action_type: ACTION,
    code_hash: `123456#${EMAIL}`,
    attempts: 0,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    created_at: new Date(0).toISOString(),
    ...overrides,
  };
}

const insertCalls: Record<string, unknown>[] = [];
/** DELETE に積まれた条件（1回の DELETE につき1件） */
const deleteFilters: Record<string, unknown>[] = [];

/**
 * otp_codes のモック
 *
 * `eq` / `gt` で積まれた条件を保持し、**保存している行に当てはめて**
 * 一致したものだけを返す。
 */
function createSupabase(
  options: {
    rows?: StoredRow[];
    selectError?: unknown;
    deleteError?: unknown;
  } = {},
) {
  const { rows = [], selectError = null, deleteError = null } = options;

  const makeMatcher = () => {
    const eqs: Record<string, unknown> = {};
    const gts: Record<string, string> = {};

    const matches = (row: StoredRow) =>
      Object.entries(eqs).every(
        ([column, value]) => row[column as keyof StoredRow] === value,
      ) &&
      Object.entries(gts).every(
        ([column, value]) =>
          new Date(row[column as keyof StoredRow] as string).getTime() >
          new Date(value).getTime(),
      );

    return { eqs, gts, matches };
  };

  const from = jest.fn(() => ({
    select: (cols: string) => {
      const m = makeMatcher();
      // ⚠️ 並び順も再現する。「自分より新しい他人の行」を使った回避を
      //    再現できないと、SELECT 側の条件落ちを検知できない
      let sort: { column: keyof StoredRow; ascending: boolean } | null = null;

      const chain: Record<string, unknown> = {
        eq: (column: string, value: unknown) => {
          m.eqs[column] = value;

          return chain;
        },
        order: (column: string, opts: { ascending?: boolean } = {}) => {
          sort = {
            column: column as keyof StoredRow,
            ascending: opts.ascending !== false,
          };

          return chain;
        },
        limit: () => chain,
        maybeSingle: () => {
          if (selectError)
            return Promise.resolve({ data: null, error: selectError });

          const matched = rows.filter(m.matches);

          if (sort) {
            const { column, ascending } = sort;

            matched.sort((a, b) => {
              const left = new Date(a[column] as string).getTime();
              const right = new Date(b[column] as string).getTime();

              return ascending ? left - right : right - left;
            });
          }

          const hit = matched[0] ?? null;

          return Promise.resolve({
            data: hit
              ? cols.includes('attempts')
                ? { id: hit.id, attempts: hit.attempts }
                : { created_at: hit.created_at }
              : null,
            error: null,
          });
        },
      };

      return chain;
    },
    delete: () => {
      const m = makeMatcher();
      let recorded = false;
      const record = () => {
        if (recorded) return;
        recorded = true;
        deleteFilters.push({ ...m.eqs });
      };

      const chain: Record<string, unknown> = {
        eq: (column: string, value: unknown) => {
          m.eqs[column] = value;

          return Object.assign(
            {
              then: (resolve: (value: unknown) => unknown) => {
                record();

                return Promise.resolve({ data: null, error: null }).then(
                  resolve,
                );
              },
            },
            chain,
          );
        },
        gt: (column: string, value: string) => {
          m.gts[column] = value;

          return chain;
        },
        select: () => {
          record();

          if (deleteError)
            return Promise.resolve({ data: null, error: deleteError });

          const hit = rows.filter(m.matches);

          return Promise.resolve({
            data: hit.map((row) => ({ id: row.id })),
            error: null,
          });
        },
      };

      return chain;
    },
    insert: (row: Record<string, unknown>) => {
      insertCalls.push(row);

      return Promise.resolve({ error: null });
    },
  }));

  // `increment_otp_attempts`（#1284）。行を実際に書き換える
  const rpc = jest.fn((name: string, args: Record<string, unknown>) => {
    if (name !== 'increment_otp_attempts') {
      return Promise.resolve({ data: null, error: null });
    }

    const row = rows.find((r) => r.id === args.p_id);

    if (!row) return Promise.resolve({ data: 5, error: null });

    row.attempts = Math.min(row.attempts + 1, 5);

    return Promise.resolve({ data: row.attempts, error: null });
  });

  return { from, rpc } as unknown as SupabaseClient;
}

beforeEach(() => {
  jest.clearAllMocks();
  insertCalls.length = 0;
  deleteFilters.length = 0;
  mockSendOtpEmail.mockResolvedValue(true);
});

// --- Tests ---

describe('sendUserBoundOtp', () => {
  it('コードを作って、用途を添えて送る', async () => {
    await expect(
      sendUserBoundOtp(createSupabase(), USER_ID, 'Owner@Example.com', ACTION),
    ).resolves.toBe(SEND_USER_BOUND_OTP_RESULT.SENT);

    expect(insertCalls[0]).toMatchObject({
      email: EMAIL,
      action_type: ACTION,
      user_id: USER_ID,
    });
    expect(mockSendOtpEmail).toHaveBeenCalledWith(EMAIL, '123456', ACTION);
  });

  /**
   * ⚠️ 用途ごとに件名・本文が変わる（#648）。流用すると受信者が
   * 「何のためのコードか」を判断できない。
   */
  it('用途をそのまま送信へ渡す', async () => {
    await sendUserBoundOtp(
      createSupabase(),
      USER_ID,
      EMAIL,
      ACCOUNT_DELETE_OTP_ACTION,
    );

    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      EMAIL,
      '123456',
      ACCOUNT_DELETE_OTP_ACTION,
    );
  });

  it('再送間隔の内側なら送らない', async () => {
    const supabase = createSupabase({
      rows: [storedRow({ created_at: new Date().toISOString() })],
    });

    await expect(
      sendUserBoundOtp(supabase, USER_ID, EMAIL, ACTION),
    ).resolves.toBe(SEND_USER_BOUND_OTP_RESULT.THROTTLED);
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  // ⚠️ 用途で絞る。別用途の送信で弾かれてはいけない
  it('別の用途の送信では弾かれない', async () => {
    const supabase = createSupabase({
      rows: [
        storedRow({
          action_type: ACCOUNT_DELETE_OTP_ACTION,
          created_at: new Date().toISOString(),
        }),
      ],
    });

    await expect(
      sendUserBoundOtp(supabase, USER_ID, EMAIL, ACTION),
    ).resolves.toBe(SEND_USER_BOUND_OTP_RESULT.SENT);
  });

  it('別の利用者の送信では弾かれない', async () => {
    const supabase = createSupabase({
      rows: [
        storedRow({
          user_id: 'someone-else',
          created_at: new Date().toISOString(),
        }),
      ],
    });

    await expect(
      sendUserBoundOtp(supabase, USER_ID, EMAIL, ACTION),
    ).resolves.toBe(SEND_USER_BOUND_OTP_RESULT.SENT);
  });

  it('直近の行の読み取りに失敗したら投げる', async () => {
    const supabase = createSupabase({ selectError: { message: 'db down' } });

    await expect(
      sendUserBoundOtp(supabase, USER_ID, EMAIL, ACTION),
    ).rejects.toThrow();
  });

  it('前のコードを利用者と用途で絞って消す', async () => {
    await sendUserBoundOtp(createSupabase(), USER_ID, EMAIL, ACTION);

    expect(deleteFilters[0]).toEqual({
      user_id: USER_ID,
      action_type: ACTION,
    });
  });

  it('送信に失敗したら行を消す', async () => {
    mockSendOtpEmail.mockResolvedValue(false);

    await expect(
      sendUserBoundOtp(createSupabase(), USER_ID, EMAIL, ACTION),
    ).resolves.toBe(SEND_USER_BOUND_OTP_RESULT.SEND_FAILED);

    expect(deleteFilters).toHaveLength(2);
  });
});

describe('consumeUserBoundOtp', () => {
  it('一致すれば成功を返す', async () => {
    const supabase = createSupabase({ rows: [storedRow()] });

    await expect(
      consumeUserBoundOtp(supabase, USER_ID, EMAIL, ACTION, '123456'),
    ).resolves.toBe(USER_BOUND_OTP_VERIFY_RESULT.SUCCESS);
  });

  it('行が無ければ無効', async () => {
    await expect(
      consumeUserBoundOtp(createSupabase(), USER_ID, EMAIL, ACTION, '123456'),
    ).resolves.toBe(USER_BOUND_OTP_VERIFY_RESULT.INVALID);
  });

  /**
   * ⛔ **これが #1359 で critical になった形。**
   *
   * 攻撃者が自分のアカウントで取ったコードを、奪った被害者のセッションで
   * 使えてしまう。
   */
  it('別の利用者が取ったコードでは通らない', async () => {
    const supabase = createSupabase({
      rows: [storedRow({ user_id: 'attacker' })],
    });

    await expect(
      consumeUserBoundOtp(supabase, USER_ID, EMAIL, ACTION, '123456'),
    ).resolves.toBe(USER_BOUND_OTP_VERIFY_RESULT.INVALID);
  });

  /**
   * ⚠️ **上のテストだけでは足りない。** 照合は SELECT と DELETE の2本で、
   * **どちらにも `user_id` が要る**。行が1つだと片方落としてももう片方が
   * 弾いて INVALID になり、変異が生き残る（#1359 で実測）。
   */
  it('自分の行があっても、他人のコードは消費できない', async () => {
    const supabase = createSupabase({
      rows: [
        storedRow({ id: 'mine', code_hash: `123456#${EMAIL}` }),
        storedRow({
          id: 'attacker-row',
          user_id: 'attacker',
          code_hash: `999999#${EMAIL}`,
        }),
      ],
    });

    await expect(
      consumeUserBoundOtp(supabase, USER_ID, EMAIL, ACTION, '999999'),
    ).resolves.toBe(USER_BOUND_OTP_VERIFY_RESULT.INVALID);
  });

  /**
   * ⛔ **用途をまたいで使えてはいけない。**
   *
   * `action_type` を照合しないと、退会のために取ったコードで
   * 二段階認証を設定できる（逆も同じ）。
   */
  it('別の用途のコードでは通らない', async () => {
    const supabase = createSupabase({
      rows: [storedRow({ action_type: ACCOUNT_DELETE_OTP_ACTION })],
    });

    await expect(
      consumeUserBoundOtp(supabase, USER_ID, EMAIL, ACTION, '123456'),
    ).resolves.toBe(USER_BOUND_OTP_VERIFY_RESULT.INVALID);
  });

  /**
   * ⚠️ **上のテストだけでは足りない**（`user_id` のときと同じ形）。
   * 行が1つだと SELECT 側が弾くので、**DELETE から `action_type` を
   * 落とした変異が生き残る**（実測で生存した）。
   *
   * 自分の `second_factor_setup` の行を1つ置いて SELECT を通し、
   * 退会のコードで消費を試みる。
   */
  it('自分の行があっても、別の用途のコードは消費できない', async () => {
    const supabase = createSupabase({
      rows: [
        storedRow({ id: 'setup', code_hash: `123456#${EMAIL}` }),
        storedRow({
          id: 'delete',
          action_type: ACCOUNT_DELETE_OTP_ACTION,
          code_hash: `999999#${EMAIL}`,
        }),
      ],
    });

    await expect(
      consumeUserBoundOtp(supabase, USER_ID, EMAIL, ACTION, '999999'),
    ).resolves.toBe(USER_BOUND_OTP_VERIFY_RESULT.INVALID);
  });

  /**
   * ⚠️ 試行回数の上限も用途ごとに数える。SELECT から `action_type` を
   * 落とすと、**別の用途で取り直した新しい行**が読まれて上限を回避できる。
   */
  it('別の用途の新しい行があっても、試行回数の上限は回避できない', async () => {
    const supabase = createSupabase({
      rows: [
        storedRow({
          id: 'setup',
          attempts: OTP_CONFIG.MAX_ATTEMPTS,
          created_at: new Date(1_000).toISOString(),
        }),
        storedRow({
          id: 'delete',
          action_type: ACCOUNT_DELETE_OTP_ACTION,
          attempts: 0,
          created_at: new Date(2_000).toISOString(),
        }),
      ],
    });

    await expect(
      consumeUserBoundOtp(supabase, USER_ID, EMAIL, ACTION, '123456'),
    ).resolves.toBe(USER_BOUND_OTP_VERIFY_RESULT.INVALID);
  });

  /**
   * ⚠️ 試行回数の上限は「自分の行」で数える。SELECT から `user_id` を
   * 落とすと最新の行＝他人の行を読み、上限を回避できる。
   */
  it('他人の新しい行があっても、自分の試行回数の上限は回避できない', async () => {
    const supabase = createSupabase({
      rows: [
        storedRow({
          id: 'mine',
          attempts: OTP_CONFIG.MAX_ATTEMPTS,
          created_at: new Date(1_000).toISOString(),
        }),
        storedRow({
          id: 'attacker-row',
          user_id: 'attacker',
          attempts: 0,
          created_at: new Date(2_000).toISOString(),
        }),
      ],
    });

    await expect(
      consumeUserBoundOtp(supabase, USER_ID, EMAIL, ACTION, '123456'),
    ).resolves.toBe(USER_BOUND_OTP_VERIFY_RESULT.INVALID);
  });

  it('期限切れのコードでは通らない', async () => {
    const supabase = createSupabase({
      rows: [
        storedRow({ expires_at: new Date(Date.now() - 1000).toISOString() }),
      ],
    });

    await expect(
      consumeUserBoundOtp(supabase, USER_ID, EMAIL, ACTION, '123456'),
    ).resolves.toBe(USER_BOUND_OTP_VERIFY_RESULT.INVALID);
  });

  // 塩を取り違えると、保存した値と永久に一致しない
  it('ハッシュは宛先を塩にして照合する', async () => {
    const supabase = createSupabase({
      rows: [storedRow({ code_hash: `123456#${EMAIL}` })],
    });

    await expect(
      consumeUserBoundOtp(supabase, USER_ID, EMAIL, ACTION, '123456'),
    ).resolves.toBe(USER_BOUND_OTP_VERIFY_RESULT.SUCCESS);
  });

  it('コードが違えば通らない', async () => {
    const supabase = createSupabase({ rows: [storedRow()] });

    await expect(
      consumeUserBoundOtp(supabase, USER_ID, EMAIL, ACTION, '000000'),
    ).resolves.toBe(USER_BOUND_OTP_VERIFY_RESULT.INVALID);
  });

  it('試行回数の上限に達していたら照合しない', async () => {
    const supabase = createSupabase({
      rows: [storedRow({ attempts: OTP_CONFIG.MAX_ATTEMPTS })],
    });

    await expect(
      consumeUserBoundOtp(supabase, USER_ID, EMAIL, ACTION, '123456'),
    ).resolves.toBe(USER_BOUND_OTP_VERIFY_RESULT.INVALID);
    expect(deleteFilters).toHaveLength(0);
  });

  // ⛔ read-then-write で書き戻さない（#1284）
  it('一致しなければ試行回数を加算する', async () => {
    const rows = [storedRow({ attempts: 2 })];
    const supabase = createSupabase({ rows });

    await consumeUserBoundOtp(supabase, USER_ID, EMAIL, ACTION, '000000');

    expect(rows[0].attempts).toBe(3);
  });

  it('同時に投げられても加算が失われない', async () => {
    const rows = [storedRow({ attempts: 0 })];
    const supabase = createSupabase({ rows });

    await Promise.all(
      Array.from({ length: 3 }, () =>
        consumeUserBoundOtp(supabase, USER_ID, EMAIL, ACTION, '000000'),
      ),
    );

    expect(rows[0].attempts).toBe(3);
  });

  it('試行回数の読み取りに失敗したら投げる', async () => {
    const supabase = createSupabase({
      rows: [storedRow()],
      selectError: { message: 'db down' },
    });

    await expect(
      consumeUserBoundOtp(supabase, USER_ID, EMAIL, ACTION, '123456'),
    ).rejects.toThrow();
  });

  it('消費の削除に失敗したら投げる', async () => {
    const supabase = createSupabase({
      rows: [storedRow()],
      deleteError: { message: 'db down' },
    });

    await expect(
      consumeUserBoundOtp(supabase, USER_ID, EMAIL, ACTION, '123456'),
    ).rejects.toThrow();
  });
});
