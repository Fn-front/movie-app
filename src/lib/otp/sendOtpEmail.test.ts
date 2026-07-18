/**
 * @jest-environment node
 */

/**
 * OTPメール送信処理 テスト
 */

// Resendモック
const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

// 環境変数モック
const originalEnv = process.env;

describe('sendOtpEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: 'test_api_key',
      RESEND_FROM_EMAIL: 'test@example.com',
    };
    // バイパス系フラグは各テストで明示設定するため baseline はクリア
    delete process.env.E2E_TEST_MODE;
    delete process.env.OTP_EMAIL_TEST_BYPASS;
    delete process.env.VERCEL_ENV;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('メール送信が成功するとtrueを返す', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });

    const { sendOtpEmail } = await import('./sendOtpEmail');
    const result = await sendOtpEmail('user@example.com', '123456');

    expect(result).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: '[Movie App] 確認コード',
      }),
    );
  });

  it('Resendがエラーを返した場合falseを返す', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'Rate limit' },
    });

    const { sendOtpEmail } = await import('./sendOtpEmail');
    const result = await sendOtpEmail('user@example.com', '123456');

    expect(result).toBe(false);
  });

  it('例外が発生した場合falseを返す', async () => {
    mockSend.mockRejectedValue(new Error('Network error'));

    const { sendOtpEmail } = await import('./sendOtpEmail');
    const result = await sendOtpEmail('user@example.com', '123456');

    expect(result).toBe(false);
  });

  it('RESEND_API_KEYが未設定の場合falseを返す', async () => {
    process.env = { ...originalEnv, RESEND_API_KEY: '' };
    jest.resetModules();

    const { sendOtpEmail } = await import('./sendOtpEmail');
    const result = await sendOtpEmail('user@example.com', '123456');

    expect(result).toBe(false);
  });

  it('メール本文に確認コードが含まれる', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });

    const { sendOtpEmail } = await import('./sendOtpEmail');
    await sendOtpEmail('user@example.com', '654321');

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('654321'),
      }),
    );
  });

  describe('テストバイパスガード（positive guard / #424）', () => {
    it('E2E_TEST_MODE=true かつ OTP_EMAIL_TEST_BYPASS=true で実送信をスキップしtrueを返す', async () => {
      process.env.E2E_TEST_MODE = 'true';
      process.env.OTP_EMAIL_TEST_BYPASS = 'true';
      delete process.env.VERCEL_ENV;
      jest.resetModules();

      const { sendOtpEmail } = await import('./sendOtpEmail');
      const result = await sendOtpEmail('user@example.com', '123456');

      expect(result).toBe(true);
      // バイパス時は実送信しない
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('OTP_EMAIL_TEST_BYPASS=true 単体（E2E_TEST_MODE無し）ではバイパスしない: VERCEL_ENV=production', async () => {
      mockSend.mockResolvedValue({ data: { id: 'x' }, error: null });
      process.env.OTP_EMAIL_TEST_BYPASS = 'true';
      process.env.VERCEL_ENV = 'production';
      jest.resetModules();

      const { sendOtpEmail } = await import('./sendOtpEmail');
      await sendOtpEmail('user@example.com', '123456');

      // 実送信パスに入る＝バイパスしていない
      expect(mockSend).toHaveBeenCalled();
    });

    it('OTP_EMAIL_TEST_BYPASS=true 単体ではバイパスしない: VERCEL_ENV=preview', async () => {
      mockSend.mockResolvedValue({ data: { id: 'x' }, error: null });
      process.env.OTP_EMAIL_TEST_BYPASS = 'true';
      process.env.VERCEL_ENV = 'preview';
      jest.resetModules();

      const { sendOtpEmail } = await import('./sendOtpEmail');
      await sendOtpEmail('user@example.com', '123456');

      expect(mockSend).toHaveBeenCalled();
    });

    it('OTP_EMAIL_TEST_BYPASS=true 単体ではバイパスしない: VERCEL_ENV 未定義', async () => {
      mockSend.mockResolvedValue({ data: { id: 'x' }, error: null });
      process.env.OTP_EMAIL_TEST_BYPASS = 'true';
      delete process.env.VERCEL_ENV;
      jest.resetModules();

      const { sendOtpEmail } = await import('./sendOtpEmail');
      await sendOtpEmail('user@example.com', '123456');

      expect(mockSend).toHaveBeenCalled();
    });

    it('E2E_TEST_MODE=true + OTP_EMAIL_TEST_BYPASS=true でも VERCEL_ENV=production ではバイパスしない（多層防御）', async () => {
      mockSend.mockResolvedValue({ data: { id: 'x' }, error: null });
      process.env.E2E_TEST_MODE = 'true';
      process.env.OTP_EMAIL_TEST_BYPASS = 'true';
      process.env.VERCEL_ENV = 'production';
      jest.resetModules();

      const { sendOtpEmail } = await import('./sendOtpEmail');
      await sendOtpEmail('user@example.com', '123456');

      expect(mockSend).toHaveBeenCalled();
    });

    it('E2E_TEST_MODE=true でも OTP_EMAIL_TEST_BYPASS が無ければバイパスしない', async () => {
      mockSend.mockResolvedValue({ data: { id: 'x' }, error: null });
      process.env.E2E_TEST_MODE = 'true';
      delete process.env.OTP_EMAIL_TEST_BYPASS;
      delete process.env.VERCEL_ENV;
      jest.resetModules();

      const { sendOtpEmail } = await import('./sendOtpEmail');
      await sendOtpEmail('user@example.com', '123456');

      expect(mockSend).toHaveBeenCalled();
    });
  });
});
