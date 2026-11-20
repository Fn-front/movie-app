/**
 * @jest-environment node
 */

/**
 * 退会の確認コード テスト（#1362）
 *
 * ⚠️ **モックは積まれた条件で実際に行を絞る。**
 *
 * 固定の行を返すモックだと、`WHERE` から条件を1つ落としても通る。
 * #1359 のレビューでは `user_id` の条件落ちが**2件とも素通り**した。
 * 同じ形の実装なので、同じ形のモックで固定する。
 *
 * ⛔ 最重要は **`user_id` を照合条件に含めること**。外すと、攻撃者が
 * 自分のアカウントで取ったコードを奪った被害者のセッションで使え、
 * **削除対象はセッションから決まる**ため被害者のアカウントが消える。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { ACCOUNT_DELETE_OTP_ACTION } from '@/constants/accountDeleteCode';
import { OTP_CONFIG } from '@/constants/otp';

// --- Mocks ---

const mockSendOtpEmail = jest.fn();
jest.mock('@/lib/otp', () => ({
  generateOtpCode: () => '123456',
  // ⚠️ 塩（第2引数）を含める。含めないと、実装側で塩を取り違える変異を
  //    検知できない
  hashOtpCode: (code: string, salt: string) => `${code}#${salt}`,
  sendOtpEmail: (...args: unknown[]) => mockSendOtpEmail(...args),
}));

import {
  SEND_ACCOUNT_DELETE_CODE_RESULT,
  ACCOUNT_DELETE_VERIFY_RESULT,
  consumeAccountDeleteCode,
  sendAccountDeleteCode,
} from './accountDeleteCode';

// --- Helpers ---

const USER_ID = 'user-1';
const EMAIL = 'owner@example.com';

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

/** 既定の行（有効期限は未来） */
function storedRow(overrides: Partial<StoredRow> = {}): StoredRow {
  return {
    id: 'row-1',
    user_id: USER_ID,
    email: EMAIL,
    action_type: ACCOUNT_DELETE_OTP_ACTION,
    code_hash: `123456#${EMAIL}`,
    attempts: 0,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    created_at: new Date(0).toISOString(),
    ...overrides,
  };
}

const insertCalls: Record<string, unknown>[] = [];
const updateCalls: Record<string, unknown>[] = [];
/** DELETE に積まれた条件（何件消そうとしたかの観測用） */
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
    /** SELECT（maybeSingle）が返すエラー */
    selectError?: unknown;
    /** 条件付き DELETE が返すエラー */
    deleteError?: unknown;
  } = {},
) {
  const { rows = [], selectError = null, deleteError = null } = options;

  /** 条件を溜めて、最後に行へ当てる */
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
      // ⚠️ **並び順も再現する。** 「最新の1行」を引く実装なので、
      //    常に先頭を返すモックだと `order` の取り違えに気づけないうえ、
      //    「自分より新しい他人の行」を使った回避を再現できない
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
      // ⚠️ 1回の DELETE につき1回だけ記録する。`eq` ごとに積むと
      //    条件の数だけ増えて件数が当てにならない
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
    update: (row: Record<string, unknown>) => {
      updateCalls.push(row);

      return { eq: () => Promise.resolve({ error: null }) };
    },
  }));

  return { from } as unknown as SupabaseClient;
}

beforeEach(() => {
  jest.clearAllMocks();
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteFilters.length = 0;
  mockSendOtpEmail.mockResolvedValue(true);
});

// --- Tests ---

describe('sendAccountDeleteCode', () => {
  it('コードを作って送る', async () => {
    await expect(
      sendAccountDeleteCode(createSupabase(), USER_ID, 'Owner@Example.com'),
    ).resolves.toBe(SEND_ACCOUNT_DELETE_CODE_RESULT.SENT);

    expect(insertCalls[0]).toMatchObject({
      email: EMAIL,
      action_type: ACCOUNT_DELETE_OTP_ACTION,
    });
    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      EMAIL,
      '123456',
      ACCOUNT_DELETE_OTP_ACTION,
    );
  });

  /**
   * ⛔ **これが無いと発行者と削除対象の一致を確認できない**
   * （#1359 の critical と同じ形）。
   */
  it('コードを利用者に紐づける', async () => {
    await sendAccountDeleteCode(createSupabase(), USER_ID, EMAIL);

    expect(insertCalls[0]).toMatchObject({ user_id: USER_ID });
  });

  /**
   * ⚠️ 用途は `account_delete`。`two_factor` を流用すると件名・本文が
   * 「二段階認証」になり、届いたコードが何のためのものか判断できなくなる
   * （#648）。取り消せない操作なのでなおさら。
   */
  it('退会の用途で送る（二段階認証を流用しない）', async () => {
    await sendAccountDeleteCode(createSupabase(), USER_ID, EMAIL);

    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'account_delete',
    );
  });

  // 二度押しでメールボックスへ連投しない
  it('再送間隔の内側なら送らない', async () => {
    const supabase = createSupabase({
      rows: [storedRow({ created_at: new Date().toISOString() })],
    });

    await expect(sendAccountDeleteCode(supabase, USER_ID, EMAIL)).resolves.toBe(
      SEND_ACCOUNT_DELETE_CODE_RESULT.THROTTLED,
    );
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  it('再送間隔を過ぎていれば送る', async () => {
    const supabase = createSupabase({
      rows: [
        storedRow({
          created_at: new Date(
            Date.now() - (OTP_CONFIG.RESEND_INTERVAL_SECONDS + 1) * 1000,
          ).toISOString(),
        }),
      ],
    });

    await expect(sendAccountDeleteCode(supabase, USER_ID, EMAIL)).resolves.toBe(
      SEND_ACCOUNT_DELETE_CODE_RESULT.SENT,
    );
  });

  // ⚠️ 宛先ではなく利用者で絞る。別の利用者の送信で自分が弾かれない
  it('別の利用者の送信では弾かれない', async () => {
    const supabase = createSupabase({
      rows: [
        storedRow({
          user_id: 'someone-else',
          created_at: new Date().toISOString(),
        }),
      ],
    });

    await expect(sendAccountDeleteCode(supabase, USER_ID, EMAIL)).resolves.toBe(
      SEND_ACCOUNT_DELETE_CODE_RESULT.SENT,
    );
  });

  /**
   * ⚠️ 握り潰すと「前回送信なし」に化け、DB が詰まっている間だけ
   * 再送間隔が素通りする（#1164 と同じ理由）。
   */
  it('直近の行の読み取りに失敗したら投げる', async () => {
    const supabase = createSupabase({ selectError: { message: 'db down' } });

    await expect(
      sendAccountDeleteCode(supabase, USER_ID, EMAIL),
    ).rejects.toThrow();
  });

  // 複数生きていると、古いコードでも通ってしまう
  it('前のコードを利用者と用途で絞って消す', async () => {
    await sendAccountDeleteCode(createSupabase(), USER_ID, EMAIL);

    expect(deleteFilters[0]).toEqual({
      user_id: USER_ID,
      action_type: ACCOUNT_DELETE_OTP_ACTION,
    });
  });

  /**
   * ⚠️ 行を残すと、届いていないコードの行が根拠になって次の試行が
   * 再送間隔に当たる（#1285 で直した誤解そのもの）。枠はルート側が
   * 消費済みで戻さないので、歯止めは残る。
   */
  it('送信に失敗したら行を消す', async () => {
    mockSendOtpEmail.mockResolvedValue(false);

    await expect(
      sendAccountDeleteCode(createSupabase(), USER_ID, EMAIL),
    ).resolves.toBe(SEND_ACCOUNT_DELETE_CODE_RESULT.SEND_FAILED);

    expect(deleteFilters).toHaveLength(2);
  });
});

describe('consumeAccountDeleteCode', () => {
  it('一致すれば成功を返す', async () => {
    const supabase = createSupabase({ rows: [storedRow()] });

    await expect(
      consumeAccountDeleteCode(supabase, USER_ID, EMAIL, '123456'),
    ).resolves.toBe(ACCOUNT_DELETE_VERIFY_RESULT.SUCCESS);
  });

  it('行が無ければ無効', async () => {
    await expect(
      consumeAccountDeleteCode(createSupabase(), USER_ID, EMAIL, '123456'),
    ).resolves.toBe(ACCOUNT_DELETE_VERIFY_RESULT.INVALID);
  });

  /**
   * ⛔ **ここが #1359 で critical になった形。**
   *
   * 攻撃者が自分のアカウントで取ったコードを、奪った被害者のセッションで
   * 使えてしまう。削除対象はセッションから決まるので、**被害者のアカウントが
   * 消える**。
   */
  it('別の利用者が取ったコードでは通らない', async () => {
    const supabase = createSupabase({
      rows: [storedRow({ user_id: 'attacker' })],
    });

    await expect(
      consumeAccountDeleteCode(supabase, USER_ID, EMAIL, '123456'),
    ).resolves.toBe(ACCOUNT_DELETE_VERIFY_RESULT.INVALID);
  });

  /**
   * ⚠️ **上のテストだけでは足りない。**
   *
   * 照合は「試行回数を読む SELECT」と「消費する DELETE」の2本で、
   * **どちらにも `user_id` が要る**。行が1つだけだと片方落としても
   * もう片方が弾いて INVALID になり、変異が生き残る（#1359 で実測）。
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
      consumeAccountDeleteCode(supabase, USER_ID, EMAIL, '999999'),
    ).resolves.toBe(ACCOUNT_DELETE_VERIFY_RESULT.INVALID);
  });

  /**
   * ⚠️ **試行回数の上限は「自分の行」で数える。**
   *
   * SELECT から `user_id` を落とすと最新の行＝他人の行を読む。攻撃者は
   * 新しい行を1本作るだけで被害者の上限をリセットできる。
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
      consumeAccountDeleteCode(supabase, USER_ID, EMAIL, '123456'),
    ).resolves.toBe(ACCOUNT_DELETE_VERIFY_RESULT.INVALID);
  });

  it('別の用途のコードでは通らない', async () => {
    const supabase = createSupabase({
      rows: [storedRow({ action_type: 'two_factor' })],
    });

    await expect(
      consumeAccountDeleteCode(supabase, USER_ID, EMAIL, '123456'),
    ).resolves.toBe(ACCOUNT_DELETE_VERIFY_RESULT.INVALID);
  });

  // 期限切れで通ると、古いコードがいつまでも使える
  it('期限切れのコードでは通らない', async () => {
    const supabase = createSupabase({
      rows: [
        storedRow({ expires_at: new Date(Date.now() - 1000).toISOString() }),
      ],
    });

    await expect(
      consumeAccountDeleteCode(supabase, USER_ID, EMAIL, '123456'),
    ).resolves.toBe(ACCOUNT_DELETE_VERIFY_RESULT.INVALID);
  });

  // 塩を取り違えると、保存した値と永久に一致しない
  it('ハッシュは宛先を塩にして照合する', async () => {
    const supabase = createSupabase({
      rows: [storedRow({ code_hash: `123456#${EMAIL}` })],
    });

    await expect(
      consumeAccountDeleteCode(supabase, USER_ID, EMAIL, '123456'),
    ).resolves.toBe(ACCOUNT_DELETE_VERIFY_RESULT.SUCCESS);
  });

  it('コードが違えば通らない', async () => {
    const supabase = createSupabase({ rows: [storedRow()] });

    await expect(
      consumeAccountDeleteCode(supabase, USER_ID, EMAIL, '000000'),
    ).resolves.toBe(ACCOUNT_DELETE_VERIFY_RESULT.INVALID);
  });

  /**
   * ⚠️ 上限に達していたら照合しない。素の UPDATE で加算すると6回目に
   * `chk_otp_attempts` で 23514 になり、静かにカウントが止まる。
   */
  it('試行回数の上限に達していたら照合しない', async () => {
    const supabase = createSupabase({
      rows: [storedRow({ attempts: OTP_CONFIG.MAX_ATTEMPTS })],
    });

    await expect(
      consumeAccountDeleteCode(supabase, USER_ID, EMAIL, '123456'),
    ).resolves.toBe(ACCOUNT_DELETE_VERIFY_RESULT.INVALID);
    expect(deleteFilters).toHaveLength(0);
  });

  // 加算しないと、総当たりの天井が無くなる
  it('一致しなければ試行回数を加算する', async () => {
    const supabase = createSupabase({ rows: [storedRow({ attempts: 2 })] });

    await consumeAccountDeleteCode(supabase, USER_ID, EMAIL, '000000');

    expect(updateCalls[0]).toEqual({ attempts: 3 });
  });

  /**
   * ⚠️ 握り潰すと「行が無い」に化け、DB が詰まっている間の試行が
   * 1回も数えられないまま INVALID で返る。
   */
  it('試行回数の読み取りに失敗したら投げる', async () => {
    const supabase = createSupabase({
      rows: [storedRow()],
      selectError: { message: 'db down' },
    });

    await expect(
      consumeAccountDeleteCode(supabase, USER_ID, EMAIL, '123456'),
    ).rejects.toThrow();
  });

  /**
   * ⚠️ 握り潰すと「削除0件」に化けて INVALID を返すうえ、試行回数だけが
   * 増える。利用者は正しいコードで締め出される。
   */
  it('消費の削除に失敗したら投げる', async () => {
    const supabase = createSupabase({
      rows: [storedRow()],
      deleteError: { message: 'db down' },
    });

    await expect(
      consumeAccountDeleteCode(supabase, USER_ID, EMAIL, '123456'),
    ).rejects.toThrow();
  });
});
