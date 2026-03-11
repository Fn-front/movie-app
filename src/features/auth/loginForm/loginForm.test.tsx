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
