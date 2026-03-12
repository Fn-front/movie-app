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
});
