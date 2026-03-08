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

// --- Tests ---

describe('ChangePasswordForm', () => {
  const user = userEvent.setup();

  const fillForm = async (overrides?: {
    currentPassword?: string;
    newPassword?: string;
    confirmNewPassword?: string;
  }) => {
    const values = {
      currentPassword: 'OldPassword1',
      newPassword: 'NewPassword1',
      confirmNewPassword: 'NewPassword1',
      ...overrides,
    };

    await user.type(
      screen.getByLabelText('現在のパスワード'),
      values.currentPassword,
    );
    await user.type(
      screen.getByLabelText('新しいパスワード'),
      values.newPassword,
    );
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      values.confirmNewPassword,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('フォームが正しく表示される', () => {
    render(<ChangePasswordForm />);

    expect(
      screen.getByRole('heading', { name: 'パスワード変更' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('現在のパスワード')).toBeInTheDocument();
    expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
    expect(
      screen.getByLabelText('新しいパスワード（確認）'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'パスワードを変更' }),
    ).toBeInTheDocument();
  });

  it('空フォーム送信時にバリデーションエラーが表示される', async () => {
    render(<ChangePasswordForm />);

    await user.click(screen.getByRole('button', { name: 'パスワードを変更' }));

    await waitFor(() => {
      expect(mockChangePassword).not.toHaveBeenCalled();
    });
  });

  it('パスワード変更成功時にトーストと成功メッセージが表示される', async () => {
    mockChangePassword.mockResolvedValue({
      success: true,
      message: 'パスワードを変更しました。',
    });

    render(<ChangePasswordForm />);
    await fillForm();
    await user.click(screen.getByRole('button', { name: 'パスワードを変更' }));

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith({
        currentPassword: 'OldPassword1',
        newPassword: 'NewPassword1',
      });
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'success' }),
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'パスワードを変更しました。',
      );
    });
  });

  it('パスワード変更失敗時にエラーが表示される', async () => {
    mockChangePassword.mockRejectedValue(
      new AxiosError('Change failed', 'ERR_BAD_REQUEST'),
    );

    render(<ChangePasswordForm />);
    await fillForm();
    await user.click(screen.getByRole('button', { name: 'パスワードを変更' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
  });
});
