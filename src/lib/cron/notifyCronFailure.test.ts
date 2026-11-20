/**
 * @jest-environment node
 */

/**
 * CRON 失敗通知のテスト（#979）
 *
 * ここで固定したいのは「通知が落ちても CRON の応答を壊さない」ことと、
 * 「判定できないときに黙らない」こと。
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// --- Mocks ---

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: (...args: unknown[]) => mockSend(...args) },
  })),
}));

const mockCheckRateLimit = jest.fn();
jest.mock('@/lib/rateLimit/rateLimit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// --- Helpers ---

const supabase = {} as SupabaseClient;
const notice = { cronName: 'cleanup-expired-records', reason: 'boom' };

const originalEnv = process.env;

/**
 * モック適用後に読み込む
 *
 * ⚠️ `RESEND_API_KEY` / `RESEND_FROM_EMAIL` を**モジュール評価時に読む**
 * ため、import を先に済ませると環境変数の差し替えが効かない
 * （`sendPasswordResetEmail.test.ts` と同じ作法）。
 */
const notifyCronFailure = async (
  ...args: Parameters<typeof import('./notifyCronFailure').notifyCronFailure>
) => {
  jest.resetModules();
  const mod = await import('./notifyCronFailure');
  return mod.notifyCronFailure(...args);
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...originalEnv,
    RESEND_API_KEY: 'test-key',
    CRON_ALERT_EMAIL: 'ops@example.com',
  };
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
  mockSend.mockResolvedValue({ error: null });
});

afterEach(() => {
  process.env = originalEnv;
  jest.restoreAllMocks();
});

// --- Tests ---

describe('notifyCronFailure', () => {
  it('CRON 名と理由を本文に載せて送る', async () => {
    await expect(notifyCronFailure(supabase, notice)).resolves.toBe(true);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ops@example.com',
        subject: expect.stringContaining('cleanup-expired-records'),
        text: expect.stringContaining('boom'),
      }),
    );
  });

  /**
   * ⚠️ 連投抑止の識別子は **CRON 名**。
   *
   * 固定値にすると、1本が失敗している間ほかの CRON の通知が全部止まる。
   */
  it('連投抑止の識別子は CRON 名', async () => {
    await notifyCronFailure(supabase, notice);

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      supabase,
      'cleanup-expired-records',
      'cron_failure_notice',
      1,
      1440,
    );
  });

  it('同じ CRON の2通目は送らない', async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });

    await expect(notifyCronFailure(supabase, notice)).resolves.toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ **ここが他のレート制限と逆向き**（fail-open）。
   *
   * 数えているのは「通知を送った回数」だけで、落ちても誰も困らない。
   * 判定できないときに黙ると**アラートそのものが失われる**ので、
   * 重複して届くほうを選ぶ。
   */
  it('連投抑止の判定に失敗しても通知は送る（fail-open）', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCheckRateLimit.mockRejectedValue(new Error('db down'));

    await expect(notifyCronFailure(supabase, notice)).resolves.toBe(true);
    expect(mockSend).toHaveBeenCalled();

    error.mockRestore();
  });

  /**
   * ⚠️ DB へ繋げないこと自体が失敗の原因でありうる。
   * そういうときこそ通知が要るので、連投抑止を諦めて送る。
   */
  it('supabase が無ければ連投抑止を諦めて送る', async () => {
    await expect(notifyCronFailure(null, notice)).resolves.toBe(true);

    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalled();
  });

  it('CRON_ALERT_EMAIL が未設定なら何もしない', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.CRON_ALERT_EMAIL;

    await expect(notifyCronFailure(supabase, notice)).resolves.toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
    // 設定漏れで本処理を壊さない。警告だけ出す
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('未設定'));

    warn.mockRestore();
  });

  /**
   * ⚠️ **この関数は throw しない契約**。
   *
   * 呼び出し側（CRON の catch）は既に応答を決めた後に呼ぶ。例外を漏らすと、
   * 通知が送れないだけで済むはずの障害がルートの応答まで壊す。
   */
  it('送信が例外を投げても throw しない', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSend.mockRejectedValue(new Error('resend down'));

    await expect(notifyCronFailure(supabase, notice)).resolves.toBe(false);

    error.mockRestore();
  });

  it('送信がエラーを返しても throw しない', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSend.mockResolvedValue({ error: { message: 'rejected' } });

    await expect(notifyCronFailure(supabase, notice)).resolves.toBe(false);

    error.mockRestore();
  });

  /**
   * 復旧しても通知は出ない。沈黙＝正常とは読めないことを本文で伝える
   * （`CRON_FAILURE_NOTICE` は「窓に空白が入るまでの通算回数」なので、
   * 失敗し続けている間は2通目が出ない）。
   */
  it('沈黙が正常を意味しないことを本文に書く', async () => {
    await notifyCronFailure(supabase, notice);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('沈黙は「正常」を意味しません'),
      }),
    );
  });
});
