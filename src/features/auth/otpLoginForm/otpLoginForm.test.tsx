import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OtpLoginForm } from './otpLoginForm';

// --- Polyfills ---

// jsdom環境ではResponseが未定義のためpolyfill
if (typeof globalThis.Response === 'undefined') {
  globalThis.Response = class Response {} as typeof globalThis.Response;
}

// --- Mocks ---

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockSignIn = jest.fn();
jest.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

// --- Tests ---

describe('OtpLoginForm', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('メールアドレス入力フォームが正しく表示される', () => {
    render(<OtpLoginForm />);

    expect(
      screen.getByRole('heading', { name: 'メールでログイン' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ログインコードを送信' }),
    ).toBeInTheDocument();
  });

  it('パスワードでログインリンクが表示される', () => {
    const mockClick = jest.fn();
    render(<OtpLoginForm onPasswordLoginClick={mockClick} />);

    expect(
      screen.getByRole('button', { name: 'パスワードでログイン' }),
    ).toBeInTheDocument();
  });

  it('onPasswordLoginClickが未指定の場合、パスワードでログインリンクが表示されない', () => {
    render(<OtpLoginForm />);

    expect(
      screen.queryByRole('button', { name: 'パスワードでログイン' }),
    ).not.toBeInTheDocument();
  });

  it('パスワードでログインクリック時にコールバックが呼ばれる', async () => {
    const mockClick = jest.fn();
    render(<OtpLoginForm onPasswordLoginClick={mockClick} />);

    await user.click(
      screen.getByRole('button', { name: 'パスワードでログイン' }),
    );
    expect(mockClick).toHaveBeenCalled();
  });

  it('メールアドレス未入力でバリデーションエラーが表示される', async () => {
    render(<OtpLoginForm />);

    await user.click(
      screen.getByRole('button', { name: 'ログインコードを送信' }),
    );

    await waitFor(() => {
      expect(
        screen.getByText('メールアドレスを入力してください'),
      ).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('メールアドレス形式不正でバリデーションエラーが表示される', async () => {
    render(<OtpLoginForm />);

    await user.type(screen.getByLabelText('メールアドレス'), 'invalid-email');
    await user.click(
      screen.getByRole('button', { name: 'ログインコードを送信' }),
    );

    await waitFor(() => {
      expect(
        screen.getByText('メールアドレスの形式が正しくありません'),
      ).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('OTP送信成功時にOTP検証画面に遷移する', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: '確認コードを送信しました。',
      }),
    });

    render(<OtpLoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: 'ログインコードを送信' }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: '確認コードを入力' }),
      ).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/auth/otp/send',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          action: 'login',
        }),
      }),
    );
  });

  it('OTP送信失敗時にエラーメッセージが表示される', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: {
          message: '登録されていないメールアドレスです。',
        },
      }),
    });

    render(<OtpLoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'unknown@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: 'ログインコードを送信' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '登録されていないメールアドレスです。',
      );
    });
  });

  it('OTP送信失敗時にerror.messageがない場合にデフォルトメッセージが表示される', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: {},
      }),
    });

    render(<OtpLoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: 'ログインコードを送信' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'ログインコードの送信に失敗しました。',
      );
    });
  });

  it('OTP検証画面でメールアドレスを変更するリンクが表示される', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: '確認コードを送信しました。',
      }),
    });

    render(<OtpLoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: 'ログインコードを送信' }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'メールアドレスを変更する' }),
      ).toBeInTheDocument();
    });
  });

  it('メールアドレスを変更するクリック時にメール入力画面に戻る', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: '確認コードを送信しました。',
      }),
    });

    render(<OtpLoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: 'ログインコードを送信' }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'メールアドレスを変更する' }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: 'メールアドレスを変更する' }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'メールでログイン' }),
      ).toBeInTheDocument();
    });
  });

  it('OTP送信時にネットワークエラーが発生した場合にエラーが表示される', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<OtpLoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: 'ログインコードを送信' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('OTP検証成功後にsignInがエラーを返した場合にエラーが表示される', async () => {
    // OTP送信成功
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: '確認コードを送信しました。',
      }),
    });

    render(<OtpLoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: 'ログインコードを送信' }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText('確認コード')).toBeInTheDocument();
    });

    // OTP検証成功
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: 'コード検証に成功しました。',
      }),
    });

    // signInがエラーを返す
    mockSignIn.mockResolvedValueOnce({
      error: 'CredentialsSignin',
      ok: false,
      status: 401,
      url: null,
    });

    await user.type(screen.getByLabelText('確認コード'), '123456');
    await user.click(screen.getByRole('button', { name: '確認コードを検証' }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('OTP検証成功後にsignInが例外をスローした場合にエラーが表示される', async () => {
    // OTP送信成功
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: '確認コードを送信しました。',
      }),
    });

    render(<OtpLoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: 'ログインコードを送信' }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText('確認コード')).toBeInTheDocument();
    });

    // OTP検証成功
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: 'コード検証に成功しました。',
      }),
    });

    // signInが例外をスロー
    mockSignIn.mockRejectedValueOnce(new Error('Network error'));

    await user.type(screen.getByLabelText('確認コード'), '123456');
    await user.click(screen.getByRole('button', { name: '確認コードを検証' }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('OTP検証成功後にsignInが呼ばれてログインされる', async () => {
    // OTP送信成功
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: '確認コードを送信しました。',
      }),
    });

    render(<OtpLoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: 'ログインコードを送信' }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText('確認コード')).toBeInTheDocument();
    });

    // OTP検証成功
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: 'コード検証に成功しました。',
      }),
    });

    mockSignIn.mockResolvedValueOnce({
      error: undefined,
      ok: true,
      status: 200,
      url: '/',
    });

    await user.type(screen.getByLabelText('確認コード'), '123456');
    await user.click(screen.getByRole('button', { name: '確認コードを検証' }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        redirect: false,
        email: 'test@example.com',
        loginMethod: 'otp',
      });
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'success' }),
      );
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('callbackUrl 指定時、OTP検証成功で callbackUrl に遷移する', async () => {
    // OTP送信成功
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<OtpLoginForm callbackUrl='/watchlist' />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: 'ログインコードを送信' }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText('確認コード')).toBeInTheDocument();
    });

    // OTP検証成功 + signIn 成功
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    mockSignIn.mockResolvedValueOnce({
      error: undefined,
      ok: true,
      status: 200,
      url: '/',
    });

    await user.type(screen.getByLabelText('確認コード'), '123456');
    await user.click(screen.getByRole('button', { name: '確認コードを検証' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/watchlist');
    });
  });

  it('危険な callbackUrl（プロトコル相対）はホームに落とされる', async () => {
    // OTP送信成功
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<OtpLoginForm callbackUrl='//evil.com/steal' />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: 'ログインコードを送信' }),
    );

    await waitFor(() => {
      expect(screen.getByLabelText('確認コード')).toBeInTheDocument();
    });

    // OTP検証成功 + signIn 成功
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    mockSignIn.mockResolvedValueOnce({
      error: undefined,
      ok: true,
      status: 200,
      url: '/',
    });

    await user.type(screen.getByLabelText('確認コード'), '123456');
    await user.click(screen.getByRole('button', { name: '確認コードを検証' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });
});
