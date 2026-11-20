/**
 * @jest-environment node
 */

// ⚠️ トップレベルに静的 import が無いと TS はこのファイルをモジュールではなく
// スクリプトとして扱う。`mockSend` は sendPasswordResetEmail.test.ts にも
// 同名でいるため、グローバルで衝突して tsc だけが落ちる（TS2451）
export {};

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn(() => ({ emails: { send: mockSend } })),
}));

describe('sendPasswordInvalidatedEmail', () => {
  const originalEnv = { ...process.env };

  /** モック適用後に読み込む（環境変数をモジュール評価時に読むため） */
  const loadModule = async () => {
    jest.resetModules();
    return import('./sendPasswordInvalidatedEmail');
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.RESEND_API_KEY = 'test-key';
    process.env.NEXTAUTH_URL = 'https://example.com';
    delete process.env.E2E_TEST_MODE;
    delete process.env.OTP_EMAIL_TEST_BYPASS;
    delete process.env.VERCEL_ENV;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('パスワード再設定のリンクとともにメールを送る', async () => {
    mockSend.mockResolvedValue({ error: null });
    const { sendPasswordInvalidatedEmail } = await loadModule();

    await expect(
      sendPasswordInvalidatedEmail('user@example.com'),
    ).resolves.toBe(true);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        text: expect.stringContaining(
          'https://example.com/auth/forgot-password',
        ),
      }),
    );
  });

  it('リンクのベースURLは設定値から取る', async () => {
    // Host ヘッダを信用すると、攻撃者が仕込んだホスト宛のリンクを
    // メールで配れてしまう（accountSetupUrl.ts と同じ方針）
    process.env.NEXTAUTH_URL = 'https://www.movie-app-fn.com';
    mockSend.mockResolvedValue({ error: null });
    const { sendPasswordInvalidatedEmail } = await loadModule();

    await sendPasswordInvalidatedEmail('user@example.com');

    const { text } = mockSend.mock.calls[0][0];

    expect(text).toContain('https://www.movie-app-fn.com/auth/forgot-password');
  });

  it('無効にした事実と理由を本文に含める', async () => {
    mockSend.mockResolvedValue({ error: null });
    const { sendPasswordInvalidatedEmail } = await loadModule();

    await sendPasswordInvalidatedEmail('user@example.com');

    const { text } = mockSend.mock.calls[0][0];

    expect(text).toContain('パスワードを無効にしました');
    expect(text).toContain('第三者が設定したもの');
    expect(text).toContain('心当たりがない場合');
  });

  it('送信に失敗したら false を返す', async () => {
    mockSend.mockResolvedValue({ error: { message: 'failed' } });
    const { sendPasswordInvalidatedEmail } = await loadModule();

    await expect(
      sendPasswordInvalidatedEmail('user@example.com'),
    ).resolves.toBe(false);
  });

  it('例外になっても false を返す', async () => {
    mockSend.mockRejectedValue(new Error('network'));
    const { sendPasswordInvalidatedEmail } = await loadModule();

    await expect(
      sendPasswordInvalidatedEmail('user@example.com'),
    ).resolves.toBe(false);
  });

  it('APIキー未設定なら送らず false を返す', async () => {
    delete process.env.RESEND_API_KEY;
    const { sendPasswordInvalidatedEmail } = await loadModule();

    await expect(
      sendPasswordInvalidatedEmail('user@example.com'),
    ).resolves.toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ この関数は throw しない契約。呼び出し元（OTP検証）は戻り値を見ずに
   * 先へ進むため、漏らすと通知が送れないだけで済むはずの障害でログインが
   * 落ちる（#1258 と同種の行き止まり）
   */
  it('NEXTAUTH_URL 未設定でも throw せず false を返す', async () => {
    delete process.env.NEXTAUTH_URL;
    mockSend.mockResolvedValue({ error: null });
    const { sendPasswordInvalidatedEmail } = await loadModule();

    await expect(
      sendPasswordInvalidatedEmail('user@example.com'),
    ).resolves.toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  describe('テスト用バイパス', () => {
    it('2つのフラグが揃えば実送信をスキップする', async () => {
      process.env.E2E_TEST_MODE = 'true';
      process.env.OTP_EMAIL_TEST_BYPASS = 'true';
      const { sendPasswordInvalidatedEmail } = await loadModule();

      await expect(
        sendPasswordInvalidatedEmail('user@example.com'),
      ).resolves.toBe(true);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it.each([
      ['E2E_TEST_MODE のみ', { E2E_TEST_MODE: 'true' }],
      ['OTP_EMAIL_TEST_BYPASS のみ', { OTP_EMAIL_TEST_BYPASS: 'true' }],
    ])('%s では有効にならない', async (_label, env) => {
      // フラグ単体で有効化されると、本番に漏れたときに送信が止まる（#424）
      Object.assign(process.env, env);
      mockSend.mockResolvedValue({ error: null });
      const { sendPasswordInvalidatedEmail } = await loadModule();

      await sendPasswordInvalidatedEmail('user@example.com');

      expect(mockSend).toHaveBeenCalled();
    });

    it('Vercel本番では両方揃っていても無効', async () => {
      process.env.E2E_TEST_MODE = 'true';
      process.env.OTP_EMAIL_TEST_BYPASS = 'true';
      process.env.VERCEL_ENV = 'production';
      mockSend.mockResolvedValue({ error: null });
      const { sendPasswordInvalidatedEmail } = await loadModule();

      await sendPasswordInvalidatedEmail('user@example.com');

      expect(mockSend).toHaveBeenCalled();
    });
  });
});
