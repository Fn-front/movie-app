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

jest.mock('@/features/auth/socialLoginButtons/socialLoginButtons', () => ({
  SocialLoginButtons: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid='social-login-buttons' data-disabled={disabled} />
  ),
}));

const mockHandleApiError = jest.fn();
jest.mock('@/utils/error', () => ({
  handleApiError: (...args: unknown[]) => mockHandleApiError(...args),
}));

jest.mock('@/features/auth/otpVerification/otpVerification', () => ({
  OtpVerification: ({
    email,
    onVerifySuccess,
  }: {
    email: string;
    action: string;
    onVerifySuccess?: () => void;
  }) => (
    <div data-testid='otp-verification'>
      <span data-testid='otp-email'>{email}</span>
      <button onClick={onVerifySuccess} data-testid='otp-verify-success'>
        検証成功
      </button>
    </div>
  ),
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
    // デフォルトはAxiosErrorのメッセージを返すように設定
    mockHandleApiError.mockReturnValue({ message: '登録に失敗しました' });
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
    expect(screen.getByTestId('social-login-buttons')).toBeInTheDocument();
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

  it('登録成功時にOTP検証画面が表示される', async () => {
    mockRegisterUser.mockResolvedValue({
      success: true,
      data: { userId: '123' },
      message: '確認コードをメールに送信しました。',
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
      expect(screen.getByTestId('otp-verification')).toBeInTheDocument();
      expect(screen.getByTestId('otp-email')).toHaveTextContent(
        'test@example.com',
      );
    });

    // フォームは非表示
    expect(screen.queryByLabelText('メールアドレス')).not.toBeInTheDocument();
  });

  it('OTP検証成功時にトーストとリダイレクトが実行される', async () => {
    mockRegisterUser.mockResolvedValue({
      success: true,
      data: { userId: '123' },
      message: '確認コードをメールに送信しました。',
    });

    render(<RegisterForm />);
    await fillForm();
    await user.click(screen.getByRole('button', { name: '新規登録' }));

    await waitFor(() => {
      expect(screen.getByTestId('otp-verification')).toBeInTheDocument();
    });

    // OTP検証成功ボタンをクリック
    await user.click(screen.getByTestId('otp-verify-success'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'success',
          description: 'メール認証が完了しました。ログインしてください。',
        }),
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
    // OTP検証画面は表示されない
    expect(screen.queryByTestId('otp-verification')).not.toBeInTheDocument();
  });

  it('handleApiErrorがmessage=nullを返す場合デフォルトエラーメッセージが使用される', async () => {
    mockRegisterUser.mockRejectedValue(new Error('Unknown'));
    mockHandleApiError.mockReturnValue({ message: null });

    render(<RegisterForm />);
    await fillForm();
    await user.click(screen.getByRole('button', { name: '新規登録' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
  });

  it('ユーザー名なしで登録成功する', async () => {
    mockRegisterUser.mockResolvedValue({
      success: true,
      data: { userId: '123' },
      message: '確認コードをメールに送信しました。',
    });

    render(<RegisterForm />);
    await fillForm({ name: '' });
    await user.click(screen.getByRole('button', { name: '新規登録' }));

    await waitFor(() => {
      expect(mockRegisterUser).toHaveBeenCalledWith(
        expect.objectContaining({
          name: undefined,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('otp-verification')).toBeInTheDocument();
    });
  });
});
