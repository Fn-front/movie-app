import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SignInContent } from './signInContent';

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

const mockFetch = jest.fn();
global.fetch = mockFetch;

// --- Tests ---

describe('SignInContent', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('初期状態でパスワードログインフォームが表示される', () => {
    render(<SignInContent />);

    expect(
      screen.getByRole('heading', { name: 'ログイン' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('パスワード')).toBeInTheDocument();
  });

  it('メールでログインクリック時にOTPログインフォームに切り替わる', async () => {
    render(<SignInContent />);

    await user.click(
      screen.getByRole('button', { name: 'メールでログイン' }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'メールでログイン' }),
      ).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('パスワード')).not.toBeInTheDocument();
  });

  it('パスワードでログインクリック時にパスワードログインフォームに戻る', async () => {
    render(<SignInContent />);

    // OTPログインに切り替え
    await user.click(
      screen.getByRole('button', { name: 'メールでログイン' }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'メールでログイン' }),
      ).toBeInTheDocument();
    });

    // パスワードログインに戻る
    await user.click(
      screen.getByRole('button', { name: 'パスワードでログイン' }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'ログイン' }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('パスワード')).toBeInTheDocument();
    });
  });
});
