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
      expect(
        screen.getByText('表示名を入力してください'),
      ).toBeInTheDocument();
    });
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
});
