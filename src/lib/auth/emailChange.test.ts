/**
 * @jest-environment node
 */

/**
 * メールアドレス変更の確認コード テスト（#1359）
 *
 * ⚠️ 固定したいのは**歯止めの順序と失敗時に何が残るか**。
 * 全部手放すと、送信が失敗し続ける状況で1リクエスト = 送信APIの1コールを
 * 無限に繰り返せる（`.claude/rules/api-route.md`）。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import { EMAIL_CHANGE_OTP_ACTION } from '@/constants/emailChange';
import { OTP_CONFIG } from '@/constants/otp';

// --- Mocks ---

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockSendOtpEmail = jest.fn();
jest.mock('@/lib/otp', () => ({
  generateOtpCode: () => '123456',
  hashOtpCode: (code: string, email: string) => `${code}:${email}`,
  sendOtpEmail: (...args: unknown[]) => mockSendOtpEmail(...args),
}));

import {
  SEND_EMAIL_CHANGE_RESULT,
  EMAIL_CHANGE_VERIFY_RESULT,
  consumeEmailChangeCode,
  sendEmailChangeCode,
} from './emailChange';

// --- Helpers ---

const deleteCalls: { email?: string; action?: string }[] = [];
const insertCalls: Record<string, unknown>[] = [];
const updateCalls: Record<string, unknown>[] = [];

/**
 * otp_codes のモック
 *
 * @param recent - 直近の行（再送間隔の判定に使う）
 * @param options - 検証時の挙動
 */
function createSupabase(
  options: {
    recent?: { created_at: string } | null;
    recentError?: unknown;
    row?: { id: string; attempts: number } | null;
    deleted?: { id: string }[];
    insertError?: unknown;
  } = {},
) {
  const {
    recent = null,
    recentError = null,
    row = null,
    deleted = [],
    insertError = null,
  } = options;

  const from = jest.fn(() => ({
    select: (cols: string) => ({
      eq: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: () =>
                Promise.resolve(
                  cols.includes('attempts')
                    ? { data: row, error: null }
                    : { data: recent, error: recentError },
                ),
            }),
          }),
        }),
      }),
    }),
    delete: () => {
      const call: { email?: string; action?: string } = {};
      deleteCalls.push(call);

      const chain = {
        eq: (column: string, value: string) => {
          if (column === 'email') call.email = value;
          if (column === 'action_type') call.action = value;

          return Object.assign(
            Promise.resolve({ data: null, error: null }),
            chain,
          );
        },
        gt: () => chain,
        select: () => Promise.resolve({ data: deleted, error: null }),
      };

      return chain;
    },
    insert: (row_: Record<string, unknown>) => {
      insertCalls.push(row_);

      return Promise.resolve({ error: insertError });
    },
    update: (row_: Record<string, unknown>) => {
      updateCalls.push(row_);

      return { eq: () => Promise.resolve({ error: null }) };
    },
  }));

  return { from } as unknown as SupabaseClient;
}

beforeEach(() => {
  jest.clearAllMocks();
  deleteCalls.length = 0;
  insertCalls.length = 0;
  updateCalls.length = 0;
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockSendOtpEmail.mockResolvedValue(true);
});

// --- Tests ---

describe('sendEmailChangeCode', () => {
  it('コードを作って送る', async () => {
    const supabase = createSupabase();

    await expect(
      sendEmailChangeCode(supabase, 'user-1', 'New@Example.com'),
    ).resolves.toBe(SEND_EMAIL_CHANGE_RESULT.SENT);

    expect(insertCalls[0]).toMatchObject({
      email: 'new@example.com',
      action_type: EMAIL_CHANGE_OTP_ACTION,
    });
    expect(mockSendOtpEmail).toHaveBeenCalledWith(
      'new@example.com',
      '123456',
      EMAIL_CHANGE_OTP_ACTION,
    );
  });

  /**
   * ⚠️ 識別子は**セッションの利用者ID**。新しいアドレスで数えると、
   * 宛先を変えるだけでカウンタが分かれて送信数を掛け算できる（#641 / #644）。
   */
  it('利用者IDで送信枠を数える', async () => {
    await sendEmailChangeCode(createSupabase(), 'user-1', 'new@example.com');

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'email_change_request',
      expect.any(Number),
      expect.any(Number),
    );
  });

  /**
   * ⚠️ **再送間隔は枠の消費より前**。ここで枠を消費すると、ボタンの
   * 二度押しだけで上限に達して1時間変更できなくなる。
   */
  it('再送間隔の内側なら枠を消費せず弾く', async () => {
    const supabase = createSupabase({
      recent: { created_at: new Date().toISOString() },
    });

    await expect(
      sendEmailChangeCode(supabase, 'user-1', 'new@example.com'),
    ).resolves.toBe(SEND_EMAIL_CHANGE_RESULT.THROTTLED);

    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  it('再送間隔を過ぎていれば送る', async () => {
    const supabase = createSupabase({
      recent: {
        created_at: new Date(
          Date.now() - (OTP_CONFIG.RESEND_INTERVAL_SECONDS + 1) * 1000,
        ).toISOString(),
      },
    });

    await expect(
      sendEmailChangeCode(supabase, 'user-1', 'new@example.com'),
    ).resolves.toBe(SEND_EMAIL_CHANGE_RESULT.SENT);
  });

  /**
   * ⚠️ 握り潰すと「前回送信なし」に化け、DB が詰まっている間だけ
   * 再送間隔が素通りする（#1164 と同じ理由）。
   */
  it('直近の行の読み取りに失敗したら投げる', async () => {
    const supabase = createSupabase({ recentError: { message: 'db down' } });

    await expect(
      sendEmailChangeCode(supabase, 'user-1', 'new@example.com'),
    ).rejects.toThrow();

    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  it('送信枠を使い切っていたら送らない', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });

    await expect(
      sendEmailChangeCode(createSupabase(), 'user-1', 'new@example.com'),
    ).resolves.toBe(SEND_EMAIL_CHANGE_RESULT.LIMIT_EXCEEDED);

    expect(mockSendOtpEmail).not.toHaveBeenCalled();
  });

  // 複数生きていると、古いコードでも通ってしまう
  it('前のコードを消してから作る', async () => {
    await sendEmailChangeCode(createSupabase(), 'user-1', 'new@example.com');

    expect(deleteCalls[0]).toEqual({
      email: 'new@example.com',
      action: EMAIL_CHANGE_OTP_ACTION,
    });
  });

  /**
   * ⚠️ **枠は戻さない。行だけ消す。**
   *
   * 行を残すと、届いていないコードの行が根拠になって次の試行が
   * 再送間隔に当たる（#1285 で直した誤解）。代わりに枠を数える
   * —— 失敗した送信も外部APIを1回消費しているので実態に合う。
   */
  it('送信に失敗したら行だけ消し、枠は戻さない', async () => {
    mockSendOtpEmail.mockResolvedValue(false);

    await expect(
      sendEmailChangeCode(createSupabase(), 'user-1', 'new@example.com'),
    ).resolves.toBe(SEND_EMAIL_CHANGE_RESULT.SEND_FAILED);

    // 作る前と失敗後の2回
    expect(deleteCalls).toHaveLength(2);
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
  });
});

describe('consumeEmailChangeCode', () => {
  it('一致すれば成功を返す', async () => {
    const supabase = createSupabase({
      row: { id: 'row-1', attempts: 0 },
      deleted: [{ id: 'row-1' }],
    });

    await expect(
      consumeEmailChangeCode(supabase, 'new@example.com', '123456'),
    ).resolves.toBe(EMAIL_CHANGE_VERIFY_RESULT.SUCCESS);
  });

  it('行が無ければ無効', async () => {
    await expect(
      consumeEmailChangeCode(createSupabase(), 'new@example.com', '123456'),
    ).resolves.toBe(EMAIL_CHANGE_VERIFY_RESULT.INVALID);
  });

  /**
   * ⚠️ 上限に達していたら**照合せずに弾く**。素の UPDATE で加算すると
   * 6回目に `chk_otp_attempts` で 23514 になり、静かにカウントが止まる。
   */
  it('試行回数の上限に達していたら照合しない', async () => {
    const supabase = createSupabase({
      row: { id: 'row-1', attempts: OTP_CONFIG.MAX_ATTEMPTS },
      deleted: [{ id: 'row-1' }],
    });

    await expect(
      consumeEmailChangeCode(supabase, 'new@example.com', '123456'),
    ).resolves.toBe(EMAIL_CHANGE_VERIFY_RESULT.INVALID);

    expect(updateCalls).toHaveLength(0);
  });

  it('一致しなければ試行回数を加算する', async () => {
    const supabase = createSupabase({
      row: { id: 'row-1', attempts: 2 },
      deleted: [],
    });

    await expect(
      consumeEmailChangeCode(supabase, 'new@example.com', '000000'),
    ).resolves.toBe(EMAIL_CHANGE_VERIFY_RESULT.INVALID);

    expect(updateCalls[0]).toEqual({ attempts: 3 });
  });
});
