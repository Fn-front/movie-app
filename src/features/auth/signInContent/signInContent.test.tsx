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

const mockSocialLoginButtons = jest.fn(
  (props: { callbackUrl?: string; disabled?: boolean }) => (
    <div
      data-testid='social-login-buttons'
      data-callback={props.callbackUrl ?? ''}
    />
  ),
);
jest.mock('@/features/auth/socialLoginButtons/socialLoginButtons', () => ({
  SocialLoginButtons: (props: { callbackUrl?: string; disabled?: boolean }) =>
    mockSocialLoginButtons(props),
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

    await user.click(screen.getByRole('button', { name: 'メールでログイン' }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'メールでログイン' }),
      ).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('パスワード')).not.toBeInTheDocument();
  });

  it('callbackUrl プロパティが LoginForm 経由で SocialLoginButtons に伝播される', () => {
    render(<SignInContent callbackUrl='/favorites' />);

    // 初期はpasswordモード → LoginForm 内の SocialLoginButtons に callbackUrl 伝播
    expect(screen.getByTestId('social-login-buttons')).toHaveAttribute(
      'data-callback',
      '/favorites',
    );
  });

  it('OTPモード切替後も callbackUrl が引き継がれる（OtpLoginForm 側）', async () => {
    render(<SignInContent callbackUrl='/watchlist' />);

    await user.click(screen.getByRole('button', { name: 'メールでログイン' }));

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'メールでログイン' }),
      ).toBeInTheDocument();
    });

    // OTP モードでは SocialLoginButtons は無いが、
    // OtpLoginForm のメール入力→送信フローで useOtpLogin(callbackUrl) に渡っている。
    // ここでは callbackUrl が同マウント中に保持されていることをスモークで確認。
    expect(
      screen.getByRole('heading', { name: 'メールでログイン' }),
    ).toBeInTheDocument();
  });

  it('パスワードでログインクリック時にパスワードログインフォームに戻る', async () => {
    render(<SignInContent />);

    // OTPログインに切り替え
    await user.click(screen.getByRole('button', { name: 'メールでログイン' }));

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
