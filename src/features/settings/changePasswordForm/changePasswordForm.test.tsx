import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';

import { ChangePasswordForm } from './changePasswordForm';

// --- Mocks ---

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockSendOtp = jest.fn();
const mockChangePassword = jest.fn();
jest.mock('@/lib/api/auth/auth', () => ({
  sendOtp: (...args: unknown[]) => mockSendOtp(...args),
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

// --- Helpers ---

const user = userEvent.setup();
const defaultEmail = 'test@example.com';

/** OTP送信 → OTP検証成功 → 新パスワード入力画面まで遷移するヘルパー */
const goToNewPasswordStep = async () => {
  mockSendOtp.mockResolvedValueOnce({ success: true });

  render(<ChangePasswordForm email={defaultEmail} />);

  await user.click(screen.getByRole('button', { name: '確認コードを送信' }));

  await waitFor(() => {
    expect(screen.getByTestId('otp-verification')).toBeInTheDocument();
  });

  await user.click(screen.getByTestId('otp-verify-success'));

  await waitFor(() => {
    expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
  });
};

// --- Tests ---

describe('ChangePasswordForm', () => {
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
    mockSendOtp.mockResolvedValueOnce({ success: true });

    render(<ChangePasswordForm email={defaultEmail} />);

    await user.click(screen.getByRole('button', { name: '確認コードを送信' }));

    await waitFor(() => {
      expect(mockSendOtp).toHaveBeenCalledWith({
        email: defaultEmail,
        action: 'password_change',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('otp-verification')).toBeInTheDocument();
      expect(screen.getByTestId('otp-email')).toHaveTextContent(defaultEmail);
    });
  });

  it('確認コード送信失敗時にエラーが表示される', async () => {
    mockSendOtp.mockRejectedValueOnce(
      new AxiosError('Send failed', 'ERR_BAD_REQUEST'),
    );

    render(<ChangePasswordForm email={defaultEmail} />);

    await user.click(screen.getByRole('button', { name: '確認コードを送信' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // OTP検証画面には遷移しない
    expect(screen.queryByTestId('otp-verification')).not.toBeInTheDocument();
  });

  it('OTP検証成功後に新パスワード入力フォームが表示される', async () => {
    await goToNewPasswordStep();

    expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
    expect(
      screen.getByLabelText('新しいパスワード（確認）'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'パスワードを変更' }),
    ).toBeInTheDocument();
  });

  it('新パスワードが短すぎるとバリデーションエラーが表示される', async () => {
    await goToNewPasswordStep();

    await user.type(screen.getByLabelText('新しいパスワード'), 'Pw1');
    await user.type(screen.getByLabelText('新しいパスワード（確認）'), 'Pw1');
    await user.click(screen.getByRole('button', { name: 'パスワードを変更' }));

    await waitFor(() => {
      expect(
        screen.getByText('パスワードは8文字以上で入力してください'),
      ).toBeInTheDocument();
    });
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('新パスワード確認が一致しないとバリデーションエラーが表示される', async () => {
    await goToNewPasswordStep();

    await user.type(
      screen.getByLabelText('新しいパスワード'),
      'NewPassword123',
    );
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      'Different123',
    );
    await user.click(screen.getByRole('button', { name: 'パスワードを変更' }));

    await waitFor(() => {
      expect(screen.getByText('パスワードが一致しません')).toBeInTheDocument();
    });
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('パスワード変更成功時にトーストと成功メッセージが表示され初期画面に戻る', async () => {
    mockChangePassword.mockResolvedValue({
      success: true,
      message: 'パスワードを変更しました。',
    });

    await goToNewPasswordStep();

    await user.type(screen.getByLabelText('新しいパスワード'), 'NewPassword1');
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      'NewPassword1',
    );
    await user.click(screen.getByRole('button', { name: 'パスワードを変更' }));

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
    mockChangePassword.mockRejectedValue(
      new AxiosError('Change failed', 'ERR_BAD_REQUEST'),
    );

    await goToNewPasswordStep();

    await user.type(screen.getByLabelText('新しいパスワード'), 'NewPassword1');
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      'NewPassword1',
    );
    await user.click(screen.getByRole('button', { name: 'パスワードを変更' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
  });

  it('OTP送信失敗時に一般エラーのメッセージが表示される', async () => {
    mockSendOtp.mockRejectedValueOnce(
      new AxiosError('Send failed', 'ERR_NETWORK'),
    );

    render(<ChangePasswordForm email={defaultEmail} />);

    await user.click(screen.getByRole('button', { name: '確認コードを送信' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('alert').textContent).toBeTruthy();
    });
  });
});
