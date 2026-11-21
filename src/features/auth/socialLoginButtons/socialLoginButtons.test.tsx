import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signIn } from 'next-auth/react';

import { AUTH_ERROR_MESSAGES, TOAST_TITLES } from '@/constants/auth';
import { PENDING_CALLBACK_URL_KEY as KEY } from '@/features/auth/utils/pendingCallbackUrl';
import { SocialLoginButtons } from './socialLoginButtons';

// --- Mocks ---

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
}));

/*
  ⚠️ `useToastDispatch` **だけ**を差し替える。`useToast` も生やすと、
  購読まで持つあちらへ戻す退行（#939 が意図的に分けたもの）に気づけない
*/
const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToastDispatch: () => ({ toast: mockToast }),
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

    // ⛔ 成功した押下でエラートーストを出さない。`catch` を `finally` へ
    //    移すと全押下で誤爆するが、それを捕まえるのはこの1行だけ（#1292）
    expect(mockToast).not.toHaveBeenCalled();
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
    beforeEach(() => {
      window.sessionStorage.clear();
      mockSignIn.mockResolvedValue(undefined as never);
    });

    // ⚠️ テスト本体の末尾で restore すると、途中で失敗したときにスパイが
    // 残って**後続テストを汚す**。外側の clearAllMocks は履歴を消すだけで
    // スパイは戻さない（jest.config.js に restoreMocks の指定も無い）
    afterEach(() => {
      jest.restoreAllMocks();
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

  /**
   * ログインを**始められなかった**とき（#1292）
   *
   * 以前は catch が無く、ボタンが元に戻るだけで**何も起きなかったように
   * 見えていた**。
   *
   * ⚠️ reject する経路は `AUTH_ERROR_MESSAGES.SOCIAL_LOGIN_START_FAILED` の
   * JSDoc を参照。**providers / csrf の取得失敗では reject しない**
   * （`fetchData` が catch して null を返す）。
   */
  describe('signIn が reject したとき', () => {
    beforeEach(() => {
      window.sessionStorage.clear();
      mockSignIn.mockRejectedValue(new Error('network down'));
    });

    it.each([['Googleでログイン'], ['GitHubでログイン']])(
      '%s で失敗を利用者に伝える',
      async (name) => {
        render(<SocialLoginButtons callbackUrl='/watchlist' />);

        await user.click(screen.getByRole('button', { name }));

        await waitFor(() => {
          expect(mockToast).toHaveBeenCalledWith({
            title: TOAST_TITLES.LOGIN_ERROR,
            description: AUTH_ERROR_MESSAGES.SOCIAL_LOGIN_START_FAILED,
            variant: 'error',
          });
        });
      },
    );

    /*
      ⛔ 預かり分を残さない。`savePendingCallbackUrl` は `signIn` の**前**に
      預けるので、往復していないのに戻り先だけが残る。次にこの画面へ来た人が
      身に覚えのない場所へ飛ばされうる（#1246 が避けている状況そのもの）
    */
    it('預かっていた戻り先が残らない', async () => {
      render(<SocialLoginButtons callbackUrl='/watchlist' />);

      await user.click(
        screen.getByRole('button', { name: 'Googleでログイン' }),
      );

      await waitFor(() => expect(mockToast).toHaveBeenCalled());
      expect(window.sessionStorage.getItem(KEY)).toBeNull();
    });

    it('ボタンは押せる状態に戻る', async () => {
      render(<SocialLoginButtons />);

      await user.click(
        screen.getByRole('button', { name: 'Googleでログイン' }),
      );

      await waitFor(() => expect(mockToast).toHaveBeenCalled());
      expect(
        screen.getByRole('button', { name: 'Googleでログイン' }),
      ).toBeEnabled();
    });

    /*
      ⚠️ `onClick` が返す Promise を React は待たないので、catch が無いと
      そのまま未処理の拒否になる。`process` の 'unhandledRejection' は
      マイクロタスクを掃き終えてから出るため、マクロタスクを1つ挟んでから見る

      ⚠️ 待つのは **`mockSignIn` が呼ばれたこと**。トーストを待つと catch が
      無いときに**待ち条件そのもの**が先に落ち、肝心の assertion へ到達しない
      （実測。catch 削除の変異で落ちていたのは待ちのタイムアウトだった）
    */
    it('未処理の Promise 拒否が出ない', async () => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => {
        unhandled.push(reason);
      };
      process.on('unhandledRejection', onUnhandled);

      try {
        render(<SocialLoginButtons />);

        await user.click(
          screen.getByRole('button', { name: 'Googleでログイン' }),
        );
        await waitFor(() => expect(mockSignIn).toHaveBeenCalled());
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });

        expect(unhandled).toEqual([]);
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    });
  });
});
