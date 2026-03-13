import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DisplayNameForm } from './displayNameForm';

// --- Mocks ---

const mockUpdateSession = jest.fn();
jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: {
        name: 'テストユーザー',
        email: 'test@example.com',
        image: null,
      },
    },
    status: 'authenticated',
    update: mockUpdateSession,
  }),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockUpdateProfile = jest.fn();
jest.mock('@/lib/api/user/user', () => ({
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
}));

jest.mock('@/utils/error', () => ({
  handleApiError: () => ({ message: 'エラーが発生しました' }),
}));

// --- Tests ---

describe('DisplayNameForm', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('表示名入力フィールドとボタンが表示される', () => {
    render(<DisplayNameForm />);

    expect(screen.getByLabelText('表示名')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '表示名を更新' }),
    ).toBeInTheDocument();
  });

  it('表示名の初期値にセッションのユーザー名が設定される', () => {
    render(<DisplayNameForm />);

    expect(screen.getByLabelText('表示名')).toHaveValue('テストユーザー');
  });

  it('表示名が空のままだとバリデーションエラーが表示される', async () => {
    render(<DisplayNameForm />);

    await user.clear(screen.getByLabelText('表示名'));
    await user.click(screen.getByRole('button', { name: '表示名を更新' }));

    await waitFor(() => {
      expect(screen.getByText('表示名を入力してください')).toBeInTheDocument();
    });
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it('表示名更新成功時にセッション更新とトーストが表示される', async () => {
    mockUpdateProfile.mockResolvedValue({});
    mockUpdateSession.mockResolvedValue({});

    render(<DisplayNameForm />);

    await user.clear(screen.getByLabelText('表示名'));
    await user.type(screen.getByLabelText('表示名'), '新しい名前');
    await user.click(screen.getByRole('button', { name: '表示名を更新' }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith('新しい名前');
    });
    await waitFor(() => {
      expect(mockUpdateSession).toHaveBeenCalledWith({ name: '新しい名前' });
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '表示名を更新しました',
        variant: 'success',
      }),
    );
  });

  it('表示名更新失敗時にエラーメッセージとトーストが表示される', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('Update failed'));

    render(<DisplayNameForm />);

    await user.clear(screen.getByLabelText('表示名'));
    await user.type(screen.getByLabelText('表示名'), '新しい名前');
    await user.click(screen.getByRole('button', { name: '表示名を更新' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '更新エラー', variant: 'error' }),
    );
  });
});
