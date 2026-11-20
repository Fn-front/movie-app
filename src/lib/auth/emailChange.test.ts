/**
 * @jest-environment node
 */

/**
 * メールアドレス変更の確認コード テスト（#1359）
 *
 * ⚠️ **モックは積まれた条件で実際に行を絞る。**
 *
 * 固定の行を返すモックだと、`WHERE` から条件を1つ落としても通る。
 * レビューの変異テストで `expires_at` / `action_type` / `email` の各条件と
 * ハッシュの塩を落とす変異が**4件とも生き残った**（`fixed-mock-loops-fake-coverage`
 * と同型）。
 *
 * ⚠️ もう1つ固定したいのは**歯止めと、失敗時に何が残るか**
 * （`.claude/rules/api-route.md`）。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { EMAIL_CHANGE_OTP_ACTION } from '@/constants/emailChange';
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
  SEND_EMAIL_CHANGE_RESULT,
  EMAIL_CHANGE_VERIFY_RESULT,
  consumeEmailChangeCode,
  sendEmailChangeCode,
} from './emailChange';

// --- Helpers ---

const USER_ID = 'user-1';
const NEW_EMAIL = 'new@example.com';

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
    email: NEW_EMAIL,
    action_type: EMAIL_CHANGE_OTP_ACTION,
    code_hash: `123456#${NEW_EMAIL}`,
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

describe('sendEmailChangeCode', () => {
  it('コードを作って送る', async () => {
    await expect(
      sendEmailChangeCode(createSupabase(), USER_ID, 'New@Example.com'),
    ).resolves.toBe(SEND_EMAIL_CHANGE_RESULT.SENT);

    expect(insertCalls[0]).toMatchObject({
      email: NEW_EMAIL,
      action_type: EMAIL_CHANGE_OTP_ACTION,
    });
    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      NEW_EMAIL,
      '123456',
      EMAIL_CHANGE_OTP_ACTION,
    );
  });

  /**
   * ⛔ **これが無いと発行者と差し替え対象の一致を確認できない**
   * （#1359 のレビューで critical）。
   */
  it('コードを利用者に紐づける', async () => {
    await sendEmailChangeCode(createSupabase(), USER_ID, NEW_EMAIL);

    expect(insertCalls[0]).toMatchObject({ user_id: USER_ID });
  });

  /**
   * ⚠️ **再送間隔は枠の消費より前**。ここで枠を消費すると、ボタンの
   * 二度押しだけで上限に達して1時間変更できなくなる。
   */
  it('再送間隔の内側なら送らない', async () => {
    const supabase = createSupabase({
      rows: [storedRow({ created_at: new Date().toISOString() })],
    });

    await expect(
      sendEmailChangeCode(supabase, USER_ID, NEW_EMAIL),
    ).resolves.toBe(SEND_EMAIL_CHANGE_RESULT.THROTTLED);

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

    await expect(
      sendEmailChangeCode(supabase, USER_ID, NEW_EMAIL),
    ).resolves.toBe(SEND_EMAIL_CHANGE_RESULT.SENT);
  });

  /**
   * ⚠️ 再送間隔の判定も**利用者で絞る**。宛先だけだと、同じ未登録アドレスを
   * 狙った別の利用者の送信で自分が弾かれる。
   */
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
      sendEmailChangeCode(supabase, USER_ID, NEW_EMAIL),
    ).resolves.toBe(SEND_EMAIL_CHANGE_RESULT.SENT);
  });

  /**
   * ⚠️ 握り潰すと「前回送信なし」に化け、DB が詰まっている間だけ
   * 再送間隔が素通りする（#1164 と同じ理由）。
   */
  it('直近の行の読み取りに失敗したら投げる', async () => {
    const supabase = createSupabase({ selectError: { message: 'db down' } });

    await expect(
      sendEmailChangeCode(supabase, USER_ID, NEW_EMAIL),
    ).rejects.toThrow();

    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  // 複数生きていると、古いコードでも通ってしまう
  it('前のコードを利用者と宛先と用途で絞って消す', async () => {
    await sendEmailChangeCode(createSupabase(), USER_ID, NEW_EMAIL);

    expect(deleteFilters[0]).toEqual({
      user_id: USER_ID,
      email: NEW_EMAIL,
      action_type: EMAIL_CHANGE_OTP_ACTION,
    });
  });

  /**
   * ⚠️ **行だけ消す。枠はルート側が数えており、ここでは戻せない。**
   *
   * 行を残すと、届いていないコードの行が根拠になって次の試行が
   * 再送間隔に当たる（#1285 で直した誤解）。
   */
  it('送信に失敗したら行を消す', async () => {
    mockSendOtpEmail.mockResolvedValue(false);

    await expect(
      sendEmailChangeCode(createSupabase(), USER_ID, NEW_EMAIL),
    ).resolves.toBe(SEND_EMAIL_CHANGE_RESULT.SEND_FAILED);

    // 作る前と失敗後の2回
    expect(deleteFilters).toHaveLength(2);
  });
});

describe('consumeEmailChangeCode', () => {
  it('一致すれば成功を返す', async () => {
    const supabase = createSupabase({ rows: [storedRow()] });

    await expect(
      consumeEmailChangeCode(supabase, USER_ID, NEW_EMAIL, '123456'),
    ).resolves.toBe(EMAIL_CHANGE_VERIFY_RESULT.SUCCESS);
  });

  it('行が無ければ無効', async () => {
    await expect(
      consumeEmailChangeCode(createSupabase(), USER_ID, NEW_EMAIL, '123456'),
    ).resolves.toBe(EMAIL_CHANGE_VERIFY_RESULT.INVALID);
  });

  /**
   * ⛔ **これが critical だった。**
   *
   * 攻撃者が自分のアカウントで取ったコードを、奪った被害者のセッションで
   * 使えてしまう。照合条件に利用者が入っていないと通る。
   */
  it('別の利用者が取ったコードでは通らない', async () => {
    const supabase = createSupabase({
      rows: [storedRow({ user_id: 'attacker' })],
    });

    await expect(
      consumeEmailChangeCode(supabase, USER_ID, NEW_EMAIL, '123456'),
    ).resolves.toBe(EMAIL_CHANGE_VERIFY_RESULT.INVALID);
  });

  /**
   * ⚠️ **上のテストだけでは足りない。**
   *
   * 照合は「試行回数を読む SELECT」と「消費する DELETE」の2本で、
   * **どちらにも `user_id` が要る**。上のケースは行が1つしか無いため、
   * 片方だけ条件を落としてももう片方が弾いて INVALID になり、
   * 変異が2件とも生き残っていた（実測）。
   *
   * ここでは**自分の行も同時に存在させて**、DELETE 側の条件だけを
   * 落としたときに攻撃者の行が消費されることを捕まえる。
   */
  it('自分の行があっても、他人のコードは消費できない', async () => {
    const supabase = createSupabase({
      rows: [
        // 自分の行（SELECT はこちらに当たる）
        storedRow({ id: 'mine', code_hash: `123456#${NEW_EMAIL}` }),
        // 攻撃者が同じ宛先で取った行
        storedRow({
          id: 'attacker-row',
          user_id: 'attacker',
          code_hash: `999999#${NEW_EMAIL}`,
        }),
      ],
    });

    await expect(
      consumeEmailChangeCode(supabase, USER_ID, NEW_EMAIL, '999999'),
    ).resolves.toBe(EMAIL_CHANGE_VERIFY_RESULT.INVALID);
  });

  /**
   * ⚠️ **試行回数の上限は「自分の行」で数える。**
   *
   * SELECT から `user_id` を落とすと、最新の行＝他人の行を読んでしまう。
   * 攻撃者は新しい行を1本作るだけで被害者の上限をリセットでき、
   * 5回ずつ無限に試せる。
   */
  it('他人の新しい行があっても、自分の試行回数の上限は回避できない', async () => {
    const supabase = createSupabase({
      rows: [
        // 自分の行。もう上限に達している（古い）
        storedRow({
          id: 'mine',
          attempts: OTP_CONFIG.MAX_ATTEMPTS,
          created_at: new Date(1_000).toISOString(),
        }),
        // 攻撃者が後から作った行。試行回数は 0
        storedRow({
          id: 'attacker-row',
          user_id: 'attacker',
          attempts: 0,
          created_at: new Date(2_000).toISOString(),
        }),
      ],
    });

    await expect(
      consumeEmailChangeCode(supabase, USER_ID, NEW_EMAIL, '123456'),
    ).resolves.toBe(EMAIL_CHANGE_VERIFY_RESULT.INVALID);
  });

  /**
   * ⚠️ 握り潰すと「行が無い」に化け、DB が詰まっている間の試行が
   * **1回も数えられない**まま INVALID で返る。
   */
  it('試行回数の読み取りに失敗したら投げる', async () => {
    const supabase = createSupabase({
      rows: [storedRow()],
      selectError: { message: 'db down' },
    });

    await expect(
      consumeEmailChangeCode(supabase, USER_ID, NEW_EMAIL, '123456'),
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
      consumeEmailChangeCode(supabase, USER_ID, NEW_EMAIL, '123456'),
    ).rejects.toThrow();
  });

  // 他用途のコードで通ってはいけない
  it('別の用途のコードでは通らない', async () => {
    const supabase = createSupabase({
      rows: [storedRow({ action_type: 'two_factor' })],
    });

    await expect(
      consumeEmailChangeCode(supabase, USER_ID, NEW_EMAIL, '123456'),
    ).resolves.toBe(EMAIL_CHANGE_VERIFY_RESULT.INVALID);
  });

  it('別の宛先のコードでは通らない', async () => {
    const supabase = createSupabase({
      rows: [storedRow({ email: 'other@example.com' })],
    });

    await expect(
      consumeEmailChangeCode(supabase, USER_ID, NEW_EMAIL, '123456'),
    ).resolves.toBe(EMAIL_CHANGE_VERIFY_RESULT.INVALID);
  });

  // ⚠️ 期限切れで通ると、古いコードがいつまでも使える
  it('期限切れのコードでは通らない', async () => {
    const supabase = createSupabase({
      rows: [
        storedRow({ expires_at: new Date(Date.now() - 1000).toISOString() }),
      ],
    });

    await expect(
      consumeEmailChangeCode(supabase, USER_ID, NEW_EMAIL, '123456'),
    ).resolves.toBe(EMAIL_CHANGE_VERIFY_RESULT.INVALID);
  });

  // 塩を取り違えると、保存した値と永久に一致しない
  it('ハッシュは宛先を塩にして照合する', async () => {
    const supabase = createSupabase({
      rows: [storedRow({ code_hash: `123456#${NEW_EMAIL}` })],
    });

    await expect(
      consumeEmailChangeCode(supabase, USER_ID, NEW_EMAIL, '123456'),
    ).resolves.toBe(EMAIL_CHANGE_VERIFY_RESULT.SUCCESS);
  });

  it('コードが違えば通らない', async () => {
    const supabase = createSupabase({ rows: [storedRow()] });

    await expect(
      consumeEmailChangeCode(supabase, USER_ID, NEW_EMAIL, '000000'),
    ).resolves.toBe(EMAIL_CHANGE_VERIFY_RESULT.INVALID);
  });

  /**
   * ⚠️ 上限に達していたら**照合せずに弾く**。素の UPDATE で加算すると
   * 6回目に `chk_otp_attempts` で 23514 になり、静かにカウントが止まる。
   */
  it('試行回数の上限に達していたら照合しない', async () => {
    const supabase = createSupabase({
      rows: [storedRow({ attempts: OTP_CONFIG.MAX_ATTEMPTS })],
    });

    await expect(
      consumeEmailChangeCode(supabase, USER_ID, NEW_EMAIL, '123456'),
    ).resolves.toBe(EMAIL_CHANGE_VERIFY_RESULT.INVALID);

    expect(updateCalls).toHaveLength(0);
  });

  it('一致しなければ試行回数を加算する', async () => {
    const supabase = createSupabase({ rows: [storedRow({ attempts: 2 })] });

    await consumeEmailChangeCode(supabase, USER_ID, NEW_EMAIL, '000000');

    expect(updateCalls[0]).toEqual({ attempts: 3 });
  });
});
