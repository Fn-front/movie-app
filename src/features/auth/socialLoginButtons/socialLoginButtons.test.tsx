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

  it('callbackUrl 指定時、signIn の callbackUrl に伝播される（Google）', async () => {
    mockSignIn.mockResolvedValue(undefined as never);

    render(<SocialLoginButtons callbackUrl='/favorites' />);

    await user.click(screen.getByRole('button', { name: 'Googleでログイン' }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('google', {
        callbackUrl: '/favorites',
      });
    });
  });

  it('callbackUrl 指定時、signIn の callbackUrl に伝播される（GitHub）', async () => {
    mockSignIn.mockResolvedValue(undefined as never);

    render(<SocialLoginButtons callbackUrl='/watchlist' />);

    await user.click(screen.getByRole('button', { name: 'GitHubでログイン' }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('github', {
        callbackUrl: '/watchlist',
      });
    });
  });

  it('危険な callbackUrl（外部URL）はホームに落として signIn に渡される', async () => {
    mockSignIn.mockResolvedValue(undefined as never);

    render(<SocialLoginButtons callbackUrl='https://evil.com/steal' />);

    await user.click(screen.getByRole('button', { name: 'Googleでログイン' }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('google', { callbackUrl: '/' });
    });
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
  describe('戻り先の退避（#1246）', () => {
    const KEY = 'auth:pendingCallbackUrl';

    beforeEach(() => {
      window.sessionStorage.clear();
      mockSignIn.mockResolvedValue(undefined as never);
    });

    it.each([['Googleでログイン'], ['GitHubでログイン']])(
      '%s で signIn の前に戻り先を預ける',
      async (name) => {
        // Auth.js は失敗時のリダイレクトに error と code しか載せないので、
        // 往復で消える callbackUrl をクライアント側で持っておく
        const order: string[] = [];
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
          order.push('save');
        });
        mockSignIn.mockImplementation((async () => {
          order.push('signIn');
          return undefined;
        }) as never);

        render(<SocialLoginButtons callbackUrl='/watchlist' />);

        await user.click(screen.getByRole('button', { name }));

        await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
        expect(order).toEqual(['save', 'signIn']);

        jest.restoreAllMocks();
      },
    );

    it('預けた値は callbackUrl そのもの', async () => {
      render(<SocialLoginButtons callbackUrl='/watchlist' />);

      await user.click(
        screen.getByRole('button', { name: 'Googleでログイン' }),
      );

      await waitFor(() =>
        expect(window.sessionStorage.getItem(KEY)).toBe('/watchlist'),
      );
    });

    it('callbackUrl が無ければ何も預けない', async () => {
      render(<SocialLoginButtons />);

      await user.click(
        screen.getByRole('button', { name: 'Googleでログイン' }),
      );

      await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    });
  });
});
