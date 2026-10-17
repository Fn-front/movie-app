import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signIn } from 'next-auth/react';
import { AxiosError } from 'axios';

import { LoginForm } from './loginForm';

// --- Mocks ---

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
}));

jest.mock('@/features/auth/socialLoginButtons/socialLoginButtons', () => ({
  SocialLoginButtons: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid='social-login-buttons' data-disabled={disabled} />
  ),
}));

const mockSignIn = signIn as jest.MockedFunction<typeof signIn>;

// --- Tests ---

describe('LoginForm', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('フォームが正しく表示される', () => {
    render(<LoginForm />);

    expect(
      screen.getByRole('heading', { name: 'ログイン' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    expect(screen.getByLabelText('パスワード')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ログイン' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('social-login-buttons')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '新規登録' })).toHaveAttribute(
      'href',
      '/auth/signup',
    );
  });

  it('メールアドレス未入力でバリデーションエラーが表示される', async () => {
    render(<LoginForm />);

    await user.type(screen.getByLabelText('パスワード'), 'Password123');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(
        screen.getByText('メールアドレスを入力してください'),
      ).toBeInTheDocument();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('パスワード未入力でバリデーションエラーが表示される', async () => {
    render(<LoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(
        screen.getByText('パスワードを入力してください'),
      ).toBeInTheDocument();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('メールアドレス形式不正でバリデーションエラーが表示される', async () => {
    render(<LoginForm />);

    await user.type(screen.getByLabelText('メールアドレス'), 'invalid-email');
    await user.type(screen.getByLabelText('パスワード'), 'Password123');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(
        screen.getByText('メールアドレスの形式が正しくありません'),
      ).toBeInTheDocument();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('ログイン成功時にトーストとリダイレクトが実行される', async () => {
    mockSignIn.mockResolvedValue({
      error: undefined,
      code: undefined,
      ok: true,
      status: 200,
      url: '/',
    });

    render(<LoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.type(screen.getByLabelText('パスワード'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        redirect: false,
        email: 'test@example.com',
        password: 'Password1',
      });
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'success' }),
      );
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('ログイン失敗時にエラーが表示される', async () => {
    mockSignIn.mockResolvedValue({
      error: 'CredentialsSignin',
      code: 'credentials',
      ok: false,
      status: 401,
      url: null,
    });

    render(<LoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.type(screen.getByLabelText('パスワード'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('onOtpLoginClick指定時にメールでログインボタンが表示される', async () => {
    const mockOtpClick = jest.fn();
    render(<LoginForm onOtpLoginClick={mockOtpClick} />);

    const otpLoginButton = screen.getByRole('button', {
      name: 'メールでログイン',
    });
    expect(otpLoginButton).toBeInTheDocument();

    await user.click(otpLoginButton);
    expect(mockOtpClick).toHaveBeenCalled();
  });

  it('onOtpLoginClick未指定時にメールでログインボタンが表示されない', () => {
    render(<LoginForm />);

    expect(
      screen.queryByRole('button', { name: 'メールでログイン' }),
    ).not.toBeInTheDocument();
  });

  it('callbackUrl 指定時、ログイン成功で callbackUrl に遷移する', async () => {
    mockSignIn.mockResolvedValue({
      error: undefined,
      code: undefined,
      ok: true,
      status: 200,
      url: '/',
    });

    render(<LoginForm callbackUrl='/favorites' />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.type(screen.getByLabelText('パスワード'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/favorites');
    });
  });

  it('危険な callbackUrl（外部URL）はホームに落とされる', async () => {
    mockSignIn.mockResolvedValue({
      error: undefined,
      code: undefined,
      ok: true,
      status: 200,
      url: '/',
    });

    render(<LoginForm callbackUrl='https://evil.com/steal' />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.type(screen.getByLabelText('パスワード'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  describe('第2要素（二段階認証）', () => {
    /** メールとパスワードを入れてログインを押す */
    const submitCredentials = async () => {
      await user.type(
        screen.getByLabelText('メールアドレス'),
        'test@example.com',
      );
      await user.type(screen.getByLabelText('パスワード'), 'Password1');
      await user.click(screen.getByRole('button', { name: 'ログイン' }));
    };

    it('初期状態では認証コード欄を表示しない', () => {
      // 常に出すと、二段階認証を使っているアカウントかどうかを
      // パスワードを知らない相手に見せてしまう
      render(<LoginForm />);

      expect(screen.queryByLabelText('認証コード')).not.toBeInTheDocument();
    });

    it('totp_required を受け取ると認証コード欄を表示する', async () => {
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code: 'totp_required',
        ok: false,
        status: 401,
        url: null,
      });

      render(<LoginForm />);
      await submitCredentials();

      expect(await screen.findByLabelText('認証コード')).toBeInTheDocument();
    });

    it('totp_required のときはエラーを表示しない', async () => {
      // パスワードは正しいので、失敗として見せるのは誤り
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code: 'totp_required',
        ok: false,
        status: 401,
        url: null,
      });

      render(<LoginForm />);
      await submitCredentials();

      await screen.findByLabelText('認証コード');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(mockToast).not.toHaveBeenCalled();
    });

    it('認証コードを入力して再送するとログインできる', async () => {
      mockSignIn
        .mockResolvedValueOnce({
          error: 'CredentialsSignin',
          code: 'totp_required',
          ok: false,
          status: 401,
          url: null,
        })
        .mockResolvedValueOnce({
          error: undefined,
          code: undefined,
          ok: true,
          status: 200,
          url: '/',
        });

      render(<LoginForm />);
      await submitCredentials();

      await user.type(await screen.findByLabelText('認証コード'), '123456');
      await user.click(screen.getByRole('button', { name: 'ログイン' }));

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenLastCalledWith(
          'credentials',
          expect.objectContaining({ totpCode: '123456' }),
        );
      });
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('認証コード欄を出していないうちは totpCode を送らない', async () => {
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code: 'totp_required',
        ok: false,
        status: 401,
        url: null,
      });

      render(<LoginForm />);
      await submitCredentials();

      expect(mockSignIn).toHaveBeenCalledWith(
        'credentials',
        expect.not.objectContaining({ totpCode: expect.anything() }),
      );
    });

    it.each([
      ['totp_invalid', '認証コードが正しくありません。'],
      [
        'totp_reused',
        'この認証コードは使用済みです。次のコードが表示されるまでお待ちください。',
      ],
      ['rate_limited', 'しばらく時間をおいてから再度お試しください。'],
    ])('%s を受け取るとその内容を表示する', async (code, message) => {
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code,
        ok: false,
        status: 401,
        url: null,
      });

      render(<LoginForm />);
      await submitCredentials();

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
    });

    it('判別できないコードは認証情報エラーに丸める', async () => {
      // どのアカウントが存在するかを推測させないため
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code: 'credentials',
        ok: false,
        status: 401,
        url: null,
      });

      render(<LoginForm />);
      await submitCredentials();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'メールアドレスまたはパスワードが正しくありません。',
      );
    });
  });

  it('signInが例外をスローした場合にエラーが表示される', async () => {
    mockSignIn.mockRejectedValue(
      new AxiosError('Network error', 'ERR_NETWORK'),
    );

    render(<LoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.type(screen.getByLabelText('パスワード'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
  });
});
