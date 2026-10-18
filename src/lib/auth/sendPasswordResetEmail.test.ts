/**
 * @jest-environment node
 */

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn(() => ({ emails: { send: mockSend } })),
}));

describe('sendPasswordResetEmail', () => {
  const originalEnv = { ...process.env };

  /** モック適用後に読み込む（環境変数をモジュール評価時に読むため） */
  const loadModule = async () => {
    jest.resetModules();
    return import('./sendPasswordResetEmail');
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.RESEND_API_KEY = 'test-key';
    delete process.env.E2E_TEST_MODE;
    delete process.env.OTP_EMAIL_TEST_BYPASS;
    delete process.env.VERCEL_ENV;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('リンクとともにメールを送る', async () => {
    mockSend.mockResolvedValue({ error: null });
    const { sendPasswordResetEmail } = await loadModule();

    await expect(
      sendPasswordResetEmail('user@example.com', 'https://example.com/r?t=x'),
    ).resolves.toBe(true);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        text: expect.stringContaining('https://example.com/r?t=x'),
      }),
    );
  });

  it('有効期限と共有禁止の警告を本文に含める', async () => {
    mockSend.mockResolvedValue({ error: null });
    const { sendPasswordResetEmail } = await loadModule();

    await sendPasswordResetEmail('user@example.com', 'https://example.com/r');

    const { text } = mockSend.mock.calls[0][0];

    expect(text).toContain('30分間有効');
    expect(text).toContain('他人に教えないでください');
    // 第三者がメールアドレスを入力しただけでも届くため
    expect(text).toContain('心当たりがない場合');
  });

  it('送信に失敗したら false を返す', async () => {
    mockSend.mockResolvedValue({ error: { message: 'failed' } });
    const { sendPasswordResetEmail } = await loadModule();

    await expect(
      sendPasswordResetEmail('user@example.com', 'https://example.com/r'),
    ).resolves.toBe(false);
  });

  it('例外になっても false を返す', async () => {
    mockSend.mockRejectedValue(new Error('network'));
    const { sendPasswordResetEmail } = await loadModule();

    await expect(
      sendPasswordResetEmail('user@example.com', 'https://example.com/r'),
    ).resolves.toBe(false);
  });

  it('APIキー未設定なら送らず false を返す', async () => {
    delete process.env.RESEND_API_KEY;
    const { sendPasswordResetEmail } = await loadModule();

    await expect(
      sendPasswordResetEmail('user@example.com', 'https://example.com/r'),
    ).resolves.toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  describe('テスト用バイパス', () => {
    it('2つのフラグが揃えば実送信をスキップする', async () => {
      process.env.E2E_TEST_MODE = 'true';
      process.env.OTP_EMAIL_TEST_BYPASS = 'true';
      const { sendPasswordResetEmail } = await loadModule();

      await expect(
        sendPasswordResetEmail('user@example.com', 'https://example.com/r'),
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
      const { sendPasswordResetEmail } = await loadModule();

      await sendPasswordResetEmail('user@example.com', 'https://example.com/r');

      expect(mockSend).toHaveBeenCalled();
    });

    it('Vercel本番では両方揃っていても無効', async () => {
      process.env.E2E_TEST_MODE = 'true';
      process.env.OTP_EMAIL_TEST_BYPASS = 'true';
      process.env.VERCEL_ENV = 'production';
      mockSend.mockResolvedValue({ error: null });
      const { sendPasswordResetEmail } = await loadModule();

      await sendPasswordResetEmail('user@example.com', 'https://example.com/r');

      expect(mockSend).toHaveBeenCalled();
    });
  });
});
