/**
 * @jest-environment node
 */

/**
 * 二段階認証を有効にしたことの通知（#1368）
 *
 * ⚠️ 固定したいのは**宛先が登録アドレスであること**と、**throw しない契約**。
 * 有効化はもう確定しているので、例外を漏らすと**リカバリーコードを一度も
 * 表示できない**まま終わる（平文はあの応答にしか出ない）。
 */

// --- Mocks ---

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: (...args: unknown[]) => mockSend(...args) },
  })),
}));

import { CONTACT_EMAIL } from '@/constants/email';
import { SECOND_FACTOR_METHOD } from '@/constants/secondFactor';

// --- Helpers ---

const EMAIL = 'owner@example.com';

const originalEnv = process.env;

/**
 * モック適用後に読み込む
 *
 * ⚠️ `RESEND_API_KEY` を**モジュール評価時に読む**ため、import を先に
 * 済ませると環境変数の差し替えが効かない。
 */
const sendNotice = async (
  method: (typeof SECOND_FACTOR_METHOD)[keyof typeof SECOND_FACTOR_METHOD] = SECOND_FACTOR_METHOD.TOTP,
) => {
  jest.resetModules();
  const mod = await import('./sendSecondFactorEnabledNotice');

  return mod.sendSecondFactorEnabledNotice(EMAIL, method);
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...originalEnv,
    RESEND_API_KEY: 'test-key',
    // テスト用バイパスは明示的に無効化する。有効だと実送信をスキップして
    // 常に true になり、何も検証できない
    E2E_TEST_MODE: 'false',
    OTP_EMAIL_TEST_BYPASS: 'false',
  };
  mockSend.mockResolvedValue({ error: null });
});

afterEach(() => {
  process.env = originalEnv;
  jest.restoreAllMocks();
});

// --- Tests ---

describe('sendSecondFactorEnabledNotice', () => {
  it('登録アドレスへ送る', async () => {
    await expect(sendNotice()).resolves.toBe(true);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: EMAIL }),
    );
  });

  /**
   * ⚠️ 方式が分からないと、利用者は「自分が設定したやつか」を判断できない。
   */
  it.each([
    [SECOND_FACTOR_METHOD.TOTP, '認証アプリ'],
    [SECOND_FACTOR_METHOD.EMAIL_OTP, 'メール'],
  ])('%s の表示名を本文に載せる', async (method, label) => {
    await sendNotice(method);

    expect(mockSend.mock.calls[0][0].text as string).toContain(label);
  });

  /**
   * ⚠️ 第2要素を登録されると、本人はログインできてもコードを出せない。
   * 「ログインして設定を見てください」では解決しないので窓口へ誘導する。
   */
  it('問い合わせ先を本文に載せる', async () => {
    await sendNotice();

    expect(mockSend.mock.calls[0][0].text as string).toContain(CONTACT_EMAIL);
  });

  it('心当たりが無い場合の案内を載せる', async () => {
    await sendNotice();

    expect(mockSend.mock.calls[0][0].text as string).toContain(
      '心当たりがない',
    );
  });

  it('APIキーが未設定なら送らずに false を返す', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.RESEND_API_KEY;

    await expect(sendNotice()).resolves.toBe(false);
    expect(mockSend).not.toHaveBeenCalled();

    error.mockRestore();
  });

  /**
   * ⚠️ **この関数は throw しない契約**。有効化はもう確定しており、例外を
   * 漏らすとリカバリーコードを一度も表示できないまま終わる。
   */
  it.each([
    ['送信が例外を投げる', () => mockSend.mockRejectedValue(new Error('down'))],
    [
      '送信がエラーを返す',
      () => mockSend.mockResolvedValue({ error: { message: 'rejected' } }),
    ],
  ])('%s でも throw せず false を返す', async (_label, arrange) => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    arrange();

    await expect(sendNotice()).resolves.toBe(false);

    error.mockRestore();
  });

  // ⚠️ バイパスは positive guard（明示的に両方 true かつ本番でない）
  it('テストモードでは実送信をスキップする', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.E2E_TEST_MODE = 'true';
    process.env.OTP_EMAIL_TEST_BYPASS = 'true';
    process.env.VERCEL_ENV = 'preview';

    await expect(sendNotice()).resolves.toBe(true);
    expect(mockSend).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('本番ではバイパスが効かない', async () => {
    process.env.E2E_TEST_MODE = 'true';
    process.env.OTP_EMAIL_TEST_BYPASS = 'true';
    process.env.VERCEL_ENV = 'production';

    await sendNotice();

    expect(mockSend).toHaveBeenCalled();
  });
});
