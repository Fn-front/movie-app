import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';

import { RegisterForm } from './registerForm';

// --- Mocks ---

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockRegisterUser = jest.fn();
jest.mock('@/lib/api/auth/auth', () => ({
  registerUser: (...args: unknown[]) => mockRegisterUser(...args),
}));

// --- Tests ---

describe('RegisterForm', () => {
  const user = userEvent.setup();

  const fillForm = async (overrides?: {
    email?: string;
    name?: string;
    password?: string;
    confirmPassword?: string;
  }) => {
    const values = {
      email: 'test@example.com',
      name: 'テストユーザー',
      password: 'Password1',
      confirmPassword: 'Password1',
      ...overrides,
    };

    await user.type(screen.getByLabelText('メールアドレス'), values.email);
    if (values.name) {
      await user.type(screen.getByLabelText('ユーザー名（任意）'), values.name);
    }
    await user.type(screen.getByLabelText('パスワード'), values.password);
    await user.type(
      screen.getByLabelText('パスワード（確認）'),
      values.confirmPassword,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('フォームが正しく表示される', () => {
    render(<RegisterForm />);

    expect(
      screen.getByRole('heading', { name: '新規登録' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    expect(screen.getByLabelText('ユーザー名（任意）')).toBeInTheDocument();
    expect(screen.getByLabelText('パスワード')).toBeInTheDocument();
    expect(screen.getByLabelText('パスワード（確認）')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '新規登録' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ログイン' })).toHaveAttribute(
      'href',
      '/auth/signin',
    );
  });

  it('メールアドレス未入力でバリデーションエラーが表示される', async () => {
    render(<RegisterForm />);

    await user.type(screen.getByLabelText('パスワード'), 'Password123');
    await user.type(screen.getByLabelText('パスワード（確認）'), 'Password123');
    await user.click(screen.getByRole('button', { name: '新規登録' }));

    await waitFor(() => {
      expect(
        screen.getByText('メールアドレスを入力してください'),
      ).toBeInTheDocument();
    });
    expect(mockRegisterUser).not.toHaveBeenCalled();
  });

  it('パスワードが短すぎるとバリデーションエラーが表示される', async () => {
    render(<RegisterForm />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.type(screen.getByLabelText('パスワード'), 'Pw1');
    await user.type(screen.getByLabelText('パスワード（確認）'), 'Pw1');
    await user.click(screen.getByRole('button', { name: '新規登録' }));

    await waitFor(() => {
      expect(
        screen.getByText('パスワードは8文字以上で入力してください'),
      ).toBeInTheDocument();
    });
    expect(mockRegisterUser).not.toHaveBeenCalled();
  });

  it('パスワードに大文字がないとバリデーションエラーが表示される', async () => {
    render(<RegisterForm />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.type(screen.getByLabelText('パスワード'), 'password123');
    await user.type(screen.getByLabelText('パスワード（確認）'), 'password123');
    await user.click(screen.getByRole('button', { name: '新規登録' }));

    await waitFor(() => {
      expect(
        screen.getByText('パスワードに大文字を含めてください'),
      ).toBeInTheDocument();
    });
    expect(mockRegisterUser).not.toHaveBeenCalled();
  });

  it('パスワード確認が一致しないとバリデーションエラーが表示される', async () => {
    render(<RegisterForm />);

    await user.type(
      screen.getByLabelText('メールアドレス'),
      'test@example.com',
    );
    await user.type(screen.getByLabelText('パスワード'), 'Password123');
    await user.type(
      screen.getByLabelText('パスワード（確認）'),
      'Different123',
    );
    await user.click(screen.getByRole('button', { name: '新規登録' }));

    await waitFor(() => {
      expect(screen.getByText('パスワードが一致しません')).toBeInTheDocument();
    });
    expect(mockRegisterUser).not.toHaveBeenCalled();
  });

  it('登録成功時にトーストとリダイレクトが実行される', async () => {
    mockRegisterUser.mockResolvedValue({
      success: true,
      data: { userId: '123' },
      message: '登録完了',
    });

    render(<RegisterForm />);
    await fillForm();
    await user.click(screen.getByRole('button', { name: '新規登録' }));

    await waitFor(() => {
      expect(mockRegisterUser).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'Password1',
        name: 'テストユーザー',
      });
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'success' }),
      );
      expect(mockPush).toHaveBeenCalledWith('/auth/signin');
    });
  });

  it('登録失敗時にエラーが表示される', async () => {
    mockRegisterUser.mockRejectedValue(
      new AxiosError('Registration failed', 'ERR_BAD_REQUEST'),
    );

    render(<RegisterForm />);
    await fillForm();
    await user.click(screen.getByRole('button', { name: '新規登録' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });

    expect(mockPush).not.toHaveBeenCalled();
  });
});
