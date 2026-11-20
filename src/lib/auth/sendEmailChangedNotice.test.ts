/**
 * @jest-environment node
 */

/**
 * メールアドレス変更通知のテスト（#1359）
 *
 * ⚠️ 固定したいのは**宛先が旧アドレスであること**と、**throw しない契約**。
 * 新アドレスへ送っても乗っ取った側に届くだけで、持ち主は気づけない。
 */

// --- Mocks ---

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: (...args: unknown[]) => mockSend(...args) },
  })),
}));

import { CONTACT_EMAIL } from '@/constants/email';

// --- Helpers ---

const OLD_EMAIL = 'old@example.com';
const NEW_EMAIL = 'new@example.com';

const originalEnv = process.env;

/**
 * モック適用後に読み込む
 *
 * ⚠️ `RESEND_API_KEY` / `RESEND_FROM_EMAIL` を**モジュール評価時に読む**ため、
 * import を先に済ませると環境変数の差し替えが効かない。
 */
const sendEmailChangedNotice = async (oldEmail: string, newEmail: string) => {
  jest.resetModules();
  const mod = await import('./sendEmailChangedNotice');

  return mod.sendEmailChangedNotice(oldEmail, newEmail);
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...originalEnv,
    RESEND_API_KEY: 'test-key',
    // テスト用バイパスは明示的に無効化する。有効だと実送信を
    // スキップして常に true になり、何も検証できない
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

describe('sendEmailChangedNotice', () => {
  /**
   * ⛔ **宛先は旧アドレス。** 新アドレスへ送ると、乗っ取った側に届くだけで
   * 持ち主が気づく機会を失う。
   */
  it('旧アドレスへ送る', async () => {
    await expect(sendEmailChangedNotice(OLD_EMAIL, NEW_EMAIL)).resolves.toBe(
      true,
    );

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: OLD_EMAIL }),
    );
  });

  it('変更前後のアドレスを本文に載せる', async () => {
    await sendEmailChangedNotice(OLD_EMAIL, NEW_EMAIL);

    const text = mockSend.mock.calls[0][0].text as string;

    expect(text).toContain(OLD_EMAIL);
    expect(text).toContain(NEW_EMAIL);
  });

  /**
   * ⚠️ 旧アドレスではもうログインできない。「窓口へご連絡ください」と
   * だけ書いて宛先が無いと、受け取った人は辿り着けない（#1315）。
   */
  it('問い合わせ先を本文に載せる', async () => {
    await sendEmailChangedNotice(OLD_EMAIL, NEW_EMAIL);

    expect(mockSend.mock.calls[0][0].text as string).toContain(CONTACT_EMAIL);
  });

  it('APIキーが未設定なら送らずに false を返す', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.RESEND_API_KEY;

    await expect(sendEmailChangedNotice(OLD_EMAIL, NEW_EMAIL)).resolves.toBe(
      false,
    );
    expect(mockSend).not.toHaveBeenCalled();

    error.mockRestore();
  });

  /**
   * ⚠️ **この関数は throw しない契約**。呼び出し側は変更が確定した後に
   * 呼ぶため、例外を漏らすと通知が送れないだけで済む障害が
   * 「変更に失敗した」という応答まで壊す。
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

    await expect(sendEmailChangedNotice(OLD_EMAIL, NEW_EMAIL)).resolves.toBe(
      false,
    );

    error.mockRestore();
  });

  /**
   * ⚠️ バイパスは **positive guard**（明示的に両方 true かつ本番でない）。
   * 片方だけでは効かない。
   */
  it('テストモードでは実送信をスキップする', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.E2E_TEST_MODE = 'true';
    process.env.OTP_EMAIL_TEST_BYPASS = 'true';
    process.env.VERCEL_ENV = 'preview';

    await expect(sendEmailChangedNotice(OLD_EMAIL, NEW_EMAIL)).resolves.toBe(
      true,
    );
    expect(mockSend).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('本番ではバイパスが効かない', async () => {
    process.env.E2E_TEST_MODE = 'true';
    process.env.OTP_EMAIL_TEST_BYPASS = 'true';
    process.env.VERCEL_ENV = 'production';

    await sendEmailChangedNotice(OLD_EMAIL, NEW_EMAIL);

    expect(mockSend).toHaveBeenCalled();
  });
});
