import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';

import { ChangePasswordForm } from './changePasswordForm';

// --- Mocks ---

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockChangePassword = jest.fn();
jest.mock('@/lib/api/auth/auth', () => ({
  changePassword: (...args: unknown[]) => mockChangePassword(...args),
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

const mockFetch = jest.fn();
global.fetch = mockFetch;

// --- Tests ---

describe('ChangePasswordForm', () => {
  const user = userEvent.setup();
  const defaultEmail = 'test@example.com';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('初期状態で確認コード送信ボタンが表示される', () => {
    render(<ChangePasswordForm email={defaultEmail} />);

    expect(
      screen.getByText(
        'パスワードを変更するには、メールアドレスに確認コードを送信します。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '確認コードを送信' }),
    ).toBeInTheDocument();
  });

  it('確認コード送信成功時にOTP検証画面に遷移する', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: '送信しました。' }),
    });

    render(<ChangePasswordForm email={defaultEmail} />);

    await user.click(
      screen.getByRole('button', { name: '確認コードを送信' }),
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth/otp/send',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: defaultEmail,
            action: 'password_change',
          }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('otp-verification')).toBeInTheDocument();
      expect(screen.getByTestId('otp-email')).toHaveTextContent(defaultEmail);
    });
  });

  it('確認コード送信失敗時にエラーが表示される', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: { message: '送信に失敗しました。' },
      }),
    });

    render(<ChangePasswordForm email={defaultEmail} />);

    await user.click(
      screen.getByRole('button', { name: '確認コードを送信' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        '送信に失敗しました。',
      );
    });

    // OTP検証画面には遷移しない
    expect(screen.queryByTestId('otp-verification')).not.toBeInTheDocument();
  });

  it('OTP検証成功後に新パスワード入力フォームが表示される', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<ChangePasswordForm email={defaultEmail} />);

    // OTP送信
    await user.click(
      screen.getByRole('button', { name: '確認コードを送信' }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('otp-verification')).toBeInTheDocument();
    });

    // OTP検証成功
    await user.click(screen.getByTestId('otp-verify-success'));

    await waitFor(() => {
      expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
      expect(
        screen.getByLabelText('新しいパスワード（確認）'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'パスワードを変更' }),
      ).toBeInTheDocument();
    });
  });

  it('新パスワードが短すぎるとバリデーションエラーが表示される', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<ChangePasswordForm email={defaultEmail} />);

    // OTP送信 → OTP検証成功
    await user.click(
      screen.getByRole('button', { name: '確認コードを送信' }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('otp-verification')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('otp-verify-success'));

    await waitFor(() => {
      expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
    });

    // 短いパスワードを入力
    await user.type(screen.getByLabelText('新しいパスワード'), 'Pw1');
    await user.type(screen.getByLabelText('新しいパスワード（確認）'), 'Pw1');
    await user.click(
      screen.getByRole('button', { name: 'パスワードを変更' }),
    );

    await waitFor(() => {
      expect(
        screen.getByText('パスワードは8文字以上で入力してください'),
      ).toBeInTheDocument();
    });
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('新パスワード確認が一致しないとバリデーションエラーが表示される', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<ChangePasswordForm email={defaultEmail} />);

    // OTP送信 → OTP検証成功
    await user.click(
      screen.getByRole('button', { name: '確認コードを送信' }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('otp-verification')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('otp-verify-success'));

    await waitFor(() => {
      expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText('新しいパスワード'),
      'NewPassword123',
    );
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      'Different123',
    );
    await user.click(
      screen.getByRole('button', { name: 'パスワードを変更' }),
    );

    await waitFor(() => {
      expect(screen.getByText('パスワードが一致しません')).toBeInTheDocument();
    });
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('パスワード変更成功時にトーストと成功メッセージが表示され初期画面に戻る', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    mockChangePassword.mockResolvedValue({
      success: true,
      message: 'パスワードを変更しました。',
    });

    render(<ChangePasswordForm email={defaultEmail} />);

    // OTP送信 → OTP検証成功
    await user.click(
      screen.getByRole('button', { name: '確認コードを送信' }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('otp-verification')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('otp-verify-success'));

    await waitFor(() => {
      expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
    });

    // 新パスワード入力・送信
    await user.type(
      screen.getByLabelText('新しいパスワード'),
      'NewPassword1',
    );
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      'NewPassword1',
    );
    await user.click(
      screen.getByRole('button', { name: 'パスワードを変更' }),
    );

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith({
        newPassword: 'NewPassword1',
      });
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'success' }),
      );
      // 初期画面（OTP送信ステップ）に戻る
      expect(
        screen.getByRole('button', { name: '確認コードを送信' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        'パスワードを変更しました。',
      );
    });
  });

  it('パスワード変更失敗時にエラーが表示される', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    mockChangePassword.mockRejectedValue(
      new AxiosError('Change failed', 'ERR_BAD_REQUEST'),
    );

    render(<ChangePasswordForm email={defaultEmail} />);

    // OTP送信 → OTP検証成功
    await user.click(
      screen.getByRole('button', { name: '確認コードを送信' }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('otp-verification')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('otp-verify-success'));

    await waitFor(() => {
      expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
    });

    // 新パスワード入力・送信
    await user.type(
      screen.getByLabelText('新しいパスワード'),
      'NewPassword1',
    );
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      'NewPassword1',
    );
    await user.click(
      screen.getByRole('button', { name: 'パスワードを変更' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
  });
});
