import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signIn } from 'next-auth/react';

import { SocialLoginButtons } from './socialLoginButtons';

// --- Mocks ---

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
}));

const mockSignIn = signIn as jest.MockedFunction<typeof signIn>;

// --- Tests ---

describe('SocialLoginButtons', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GoogleとGitHubのログインボタンが表示される', () => {
    render(<SocialLoginButtons />);

    expect(
      screen.getByRole('button', { name: 'Googleでログイン' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'GitHubでログイン' }),
    ).toBeInTheDocument();
  });

  it('区切り線「または」が表示される', () => {
    render(<SocialLoginButtons />);

    expect(screen.getByText('または')).toBeInTheDocument();
  });

  it('Googleボタンクリック時にsignIn("google")が呼ばれる', async () => {
    mockSignIn.mockResolvedValue(undefined as never);

    render(<SocialLoginButtons />);

    await user.click(screen.getByRole('button', { name: 'Googleでログイン' }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('google', { callbackUrl: '/' });
    });
  });

  it('GitHubボタンクリック時にsignIn("github")が呼ばれる', async () => {
    mockSignIn.mockResolvedValue(undefined as never);

    render(<SocialLoginButtons />);

    await user.click(screen.getByRole('button', { name: 'GitHubでログイン' }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('github', { callbackUrl: '/' });
    });
  });

  it('disabled=trueの場合、ボタンが無効化される', () => {
    render(<SocialLoginButtons disabled />);

    expect(
      screen.getByRole('button', { name: 'Googleでログイン' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'GitHubでログイン' }),
    ).toBeDisabled();
  });

  it('ボタンクリック中は両方のボタンが無効化される', async () => {
    // signInを解決しないPromiseにして、ローディング状態を維持
    mockSignIn.mockReturnValue(new Promise(() => {}));

    render(<SocialLoginButtons />);

    await user.click(screen.getByRole('button', { name: 'Googleでログイン' }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'GitHubでログイン' }),
      ).toBeDisabled();
    });
  });
});
