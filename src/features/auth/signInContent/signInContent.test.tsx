import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SignInContent } from './signInContent';

// --- Mocks ---

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

/** `?error=` 付きの URL でページを開いた状態にする */
const setLocation = (search: string) => {
  window.history.replaceState({}, '', `/auth/signin${search}`);
};

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
  useToastDispatch: () => ({ toast: mockToast }),
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

  /**
   * パスワード設定の完了画面から渡ってくるアカウント名（#1237）
   *
   * 発行アカウントの利用者はここで自分のメールアドレスを入れて失敗
   * しがちで、実際に起きている
   */
  it('initialIdentifier が LoginForm の入力欄に入る', () => {
    render(<SignInContent initialIdentifier='GQTDXC4QHWC3' />);

    expect(
      screen.getByLabelText('メールアドレスまたはアカウント名'),
    ).toHaveValue('GQTDXC4QHWC3');
  });

  it('initialIdentifier が無ければ入力欄は空', () => {
    render(<SignInContent />);

    expect(
      screen.getByLabelText('メールアドレスまたはアカウント名'),
    ).toHaveValue('');
  });

  /**
   * ソーシャルログインの失敗（#1242）
   *
   * `/auth/signin?error=` で戻された文言を LoginForm まで通す
   */
  describe('initialError', () => {
    it('LoginForm に渡してエラーを表示する', () => {
      render(<SignInContent initialError='ログインできませんでした' />);

      expect(screen.getByRole('alert')).toHaveTextContent(
        'ログインできませんでした',
      );
    });

    /**
     * 表示したら URL から `?error=` を落とす
     *
     * 残すと同じエラーが蘇る。`MissingCSRF` は文言が「再読み込みして
     * ください」なので、従うたびに同じ画面に戻ることになる
     */
    describe('URL の後始末', () => {
      it('?error= を除いた URL へ置き換える', async () => {
        setLocation('?error=OAuthCallbackError&callbackUrl=%2Fwatchlist');

        render(<SignInContent initialError='ログインできませんでした' />);

        await waitFor(() => {
          expect(mockReplace).toHaveBeenCalledWith(
            '/auth/signin?callbackUrl=%2Fwatchlist',
            { scroll: false },
          );
        });
      });

      it('callbackUrl は残す', async () => {
        // 落とすのは error だけ。戻り先まで消すとログイン後にホームへ飛ぶ
        setLocation('?error=MissingCSRF&callbackUrl=%2Ffavorites');

        render(<SignInContent initialError='ログインできませんでした' />);

        await waitFor(() => {
          expect(mockReplace).toHaveBeenCalled();
        });
        expect(mockReplace.mock.calls[0][0]).toContain(
          'callbackUrl=%2Ffavorites',
        );
        expect(mockReplace.mock.calls[0][0]).not.toContain('error=');
      });

      it('表示中の文言はそのまま残す', async () => {
        // URL を消した拍子に文言まで消えると、戻された理由が分からない
        setLocation('?error=OAuthCallbackError');

        render(<SignInContent initialError='ログインできませんでした' />);

        await waitFor(() => {
          expect(mockReplace).toHaveBeenCalled();
        });
        expect(screen.getByRole('alert')).toHaveTextContent(
          'ログインできませんでした',
        );
      });

      it('エラーが無ければ URL に触らない', () => {
        setLocation('?callbackUrl=%2Fwatchlist');

        render(<SignInContent />);

        expect(mockReplace).not.toHaveBeenCalled();
      });
    });

    /**
     * OTP へ切り替えて戻ってもエラーが蘇らない
     *
     * ⚠️ 「OTP 画面にエラーが出ないこと」だけを見てはいけない。OTP 側は
     * `LoginForm` ごとアンマウントされ、`OtpLoginForm` の `role='alert'` は
     * 自前 state が null なので描画されない。つまり `queryByRole('alert')`
     * は**実装を壊しても常に null** で、何も検証していない。
     * 見るべきは**パスワード画面へ戻したとき**の状態
     */
    it('OTPへ切り替えて戻ってもエラーが蘇らない', async () => {
      setLocation('?error=OAuthCallbackError');

      const { rerender } = render(
        <SignInContent initialError='ログインできませんでした' />,
      );

      await user.click(
        screen.getByRole('button', { name: 'メールでログイン' }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'メールでログイン' }),
        ).toBeInTheDocument();
      });

      // router.replace で `?error=` が落ちた後のサーバー再描画を模す。
      // 実機ではここで initialError が undefined になって渡ってくる
      rerender(<SignInContent />);

      await user.click(
        screen.getByRole('button', { name: 'パスワードでログイン' }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: 'ログイン' }),
        ).toBeInTheDocument();
      });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
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
