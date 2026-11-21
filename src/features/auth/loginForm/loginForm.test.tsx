import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { signIn } from 'next-auth/react';
import { AxiosError } from 'axios';

import {
  AUTH_ERROR_CODE,
  AUTH_ERROR_MESSAGES,
  AUTH_HINTS,
  TOAST_MESSAGES,
} from '@/constants/auth';
import { OTP_CONFIG } from '@/constants/otp';

import { LoginForm } from './loginForm';

// --- Mocks ---

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
  useToastDispatch: () => ({ toast: mockToast }),
}));

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
}));

jest.mock('@/features/auth/socialLoginButtons/socialLoginButtons', () => ({
  SocialLoginButtons: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid='social-login-buttons' data-disabled={disabled} />
  ),
}));

const mockSignIn = signIn as jest.MockedFunction<typeof signIn>;

// --- Tests ---

describe('LoginForm', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * ユーザー名でもログインできることを画面で伝える（#1237）
   *
   * ラベルは以前から両対応だったが、それでも自分のメールアドレスを入れて
   * 失敗する人がいた。発行アカウントの利用者はメールを閉じていると自分の
   * アカウント名を思い出せないため、どこに書いてあるかまで示す
   */
  it('発行アカウントの利用者に、アカウント名の在りかを案内する', () => {
    render(<LoginForm />);

    const hint = screen.getByText(AUTH_HINTS.USERNAME_LOGIN);

    expect(hint).toBeInTheDocument();
    expect(AUTH_HINTS.USERNAME_LOGIN).toContain('アカウント名');
    // どこを見ればよいかまで言う。「アカウント名で」だけでは思い出せない
    expect(AUTH_HINTS.USERNAME_LOGIN).toContain('メール');
  });

  it('渡されたアカウント名を入力欄に入れておく', () => {
    // パスワード設定の完了画面から来た場合。値は分かっているのに、
    // ここで思い出せずメールアドレスを入れて失敗していた（#1237）
    render(<LoginForm initialIdentifier='ABCD1234EFGH' />);

    expect(
      screen.getByLabelText('メールアドレスまたはアカウント名'),
    ).toHaveValue('ABCD1234EFGH');
  });

  it('アカウント名が渡されなければ空のまま', () => {
    render(<LoginForm />);

    expect(
      screen.getByLabelText('メールアドレスまたはアカウント名'),
    ).toHaveValue('');
  });

  /**
   * ソーシャルログインの失敗（#1242）
   *
   * `/auth/signin?error=` へのリダイレクトで戻ってくる。ページごと
   * 再読み込みされるので state には残らず、prop で受け取る
   */
  describe('初期エラー', () => {
    it('渡された文言を最初から表示する', () => {
      render(<LoginForm initialError='ソーシャルログインに失敗しました' />);

      expect(screen.getByRole('alert')).toHaveTextContent(
        'ソーシャルログインに失敗しました',
      );
    });

    it('渡されなければエラーを出さない', () => {
      render(<LoginForm />);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('フォームが正しく表示される', () => {
    render(<LoginForm />);

    expect(
      screen.getByRole('heading', { name: 'ログイン' }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('メールアドレスまたはアカウント名'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('パスワード')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ログイン' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('social-login-buttons')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '新規登録' })).toHaveAttribute(
      'href',
      '/auth/signup',
    );
  });

  it('メールアドレス未入力でバリデーションエラーが表示される', async () => {
    render(<LoginForm />);

    await user.type(screen.getByLabelText('パスワード'), 'Password123');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(
        screen.getByText('メールアドレスを入力してください'),
      ).toBeInTheDocument();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('パスワード未入力でバリデーションエラーが表示される', async () => {
    render(<LoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレスまたはアカウント名'),
      'test@example.com',
    );
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(
        screen.getByText('パスワードを入力してください'),
      ).toBeInTheDocument();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  // 入力欄はメールアドレスとアカウント名を兼用するため、どちらとしても
  // 解釈できない入力を弾く
  it('メールアドレス形式不正でバリデーションエラーが表示される', async () => {
    render(<LoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレスまたはアカウント名'),
      'invalid-email',
    );
    await user.type(screen.getByLabelText('パスワード'), 'Password123');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'メールアドレスまたはアカウント名の形式が正しくありません',
        ),
      ).toBeInTheDocument();
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('ログイン成功時にトーストとリダイレクトが実行される', async () => {
    mockSignIn.mockResolvedValue({
      error: undefined,
      code: undefined,
      ok: true,
      status: 200,
      url: '/',
    });

    render(<LoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレスまたはアカウント名'),
      'test@example.com',
    );
    await user.type(screen.getByLabelText('パスワード'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        redirect: false,
        email: 'test@example.com',
        password: 'Password1',
      });
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'success' }),
      );
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('ログイン失敗時にエラーが表示される', async () => {
    mockSignIn.mockResolvedValue({
      error: 'CredentialsSignin',
      code: 'credentials',
      ok: false,
      status: 401,
      url: null,
    });

    render(<LoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレスまたはアカウント名'),
      'test@example.com',
    );
    await user.type(screen.getByLabelText('パスワード'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  /**
   * メール認証が未完了のアカウント（#1247）
   *
   * 登録して確認コードを入れる前に離脱した人。以前は丸められて
   * 「メールアドレスまたはパスワードが正しくありません」と出ており、
   * **パスワードは正しい**ので何度打ち直しても通らなかった
   */
  it('email_not_verified は理由と次の手順を出す', async () => {
    mockSignIn.mockResolvedValue({
      error: 'CredentialsSignin',
      code: 'email_not_verified',
      ok: false,
      status: 401,
      url: null,
    });

    render(<LoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレスまたはアカウント名'),
      'test@example.com',
    );
    await user.type(screen.getByLabelText('パスワード'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        AUTH_ERROR_MESSAGES.EMAIL_NOT_VERIFIED,
      );
    });

    // トーストにも同じ文言が出る（画面を見ていない人にも届く）
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: AUTH_ERROR_MESSAGES.EMAIL_NOT_VERIFIED,
        variant: 'error',
      }),
    );
  });

  /**
   * ⛔ **メールOTPログインの導線を戻さない**（#1361）。
   *
   * 受信箱を押さえられるとパスワードを知らなくてもログインできる経路で、
   * パスワード再設定と二重に存在していた。消しても復旧手段は残る。
   */
  it('メールでログインの導線が無い', () => {
    render(<LoginForm />);

    expect(
      screen.queryByRole('button', { name: 'メールでログイン' }),
    ).not.toBeInTheDocument();
    // 再設定の導線は残す。これが唯一の復旧経路になった
    expect(
      screen.getByRole('link', { name: 'パスワードをお忘れの方' }),
    ).toBeInTheDocument();
  });

  it('callbackUrl 指定時、ログイン成功で callbackUrl に遷移する', async () => {
    mockSignIn.mockResolvedValue({
      error: undefined,
      code: undefined,
      ok: true,
      status: 200,
      url: '/',
    });

    render(<LoginForm callbackUrl='/favorites' />);

    await user.type(
      screen.getByLabelText('メールアドレスまたはアカウント名'),
      'test@example.com',
    );
    await user.type(screen.getByLabelText('パスワード'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/favorites');
    });
  });

  it('危険な callbackUrl（外部URL）はホームに落とされる', async () => {
    mockSignIn.mockResolvedValue({
      error: undefined,
      code: undefined,
      ok: true,
      status: 200,
      url: '/',
    });

    render(<LoginForm callbackUrl='https://evil.com/steal' />);

    await user.type(
      screen.getByLabelText('メールアドレスまたはアカウント名'),
      'test@example.com',
    );
    await user.type(screen.getByLabelText('パスワード'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  /**
   * 成功トーストの文面が実際の行き先と一致する（#1385）
   *
   * 以前は固定で「ホーム画面に移動します。」だった。`/watchlist` へ誘導されて
   * ログインした人は、ウォッチリストに着いているのにホームへ行くと言われる。
   * 見えている画面と読み上げが食い違うので、スクリーンリーダー利用者に重い。
   *
   * ⚠️ 判定は**解決後の遷移先**で行う。prop の有無で分けると、弾かれた
   * `callbackUrl`（ホームへ落ちる）で文面だけ「元のページに戻ります。」に
   * なり、同じ食い違いが別の形で残る
   */
  describe('ログイン成功トーストの文面', () => {
    /** 成功する signIn を仕込んでログインまで進める */
    const loginWith = async (callbackUrl?: string) => {
      mockSignIn.mockResolvedValue({
        error: undefined,
        code: undefined,
        ok: true,
        status: 200,
        url: '/',
      });

      render(<LoginForm callbackUrl={callbackUrl} />);

      await user.type(
        screen.getByLabelText('メールアドレスまたはアカウント名'),
        'test@example.com',
      );
      await user.type(screen.getByLabelText('パスワード'), 'Password1');
      await user.click(screen.getByRole('button', { name: 'ログイン' }));
    };

    it('戻り先が無いときは「ホーム画面に移動します。」', async () => {
      await loginWith();

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: 'success',
            description: TOAST_MESSAGES.LOGIN_SUCCESS_DESCRIPTION,
          }),
        );
      });
    });

    it('戻り先があるときは「元のページに戻ります。」', async () => {
      await loginWith('/watchlist');

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: 'success',
            description: TOAST_MESSAGES.LOGIN_SUCCESS_REDIRECT_DESCRIPTION,
          }),
        );
      });
    });

    it('弾かれた callbackUrl はホームへ行くので、文面もホームになる', async () => {
      await loginWith('https://evil.com/steal');

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: TOAST_MESSAGES.LOGIN_SUCCESS_DESCRIPTION,
        }),
      );
    });
  });

  describe('第2要素（二段階認証）', () => {
    /** メールとパスワードを入れてログインを押す */
    const submitCredentials = async () => {
      await user.type(
        screen.getByLabelText('メールアドレスまたはアカウント名'),
        'test@example.com',
      );
      await user.type(screen.getByLabelText('パスワード'), 'Password1');
      await user.click(screen.getByRole('button', { name: 'ログイン' }));
    };

    it('初期状態では認証コード欄を表示しない', () => {
      // 常に出すと、二段階認証を使っているアカウントかどうかを
      // パスワードを知らない相手に見せてしまう
      render(<LoginForm />);

      expect(screen.queryByLabelText('認証コード')).not.toBeInTheDocument();
    });

    it('totp_required を受け取ると認証コード欄を表示する', async () => {
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code: 'totp_required',
        ok: false,
        status: 401,
        url: null,
      });

      render(<LoginForm />);
      await submitCredentials();

      expect(await screen.findByLabelText('認証コード')).toBeInTheDocument();
    });

    it('totp_required のときはエラーを表示しない', async () => {
      // パスワードは正しいので、失敗として見せるのは誤り
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code: 'totp_required',
        ok: false,
        status: 401,
        url: null,
      });

      render(<LoginForm />);
      await submitCredentials();

      await screen.findByLabelText('認証コード');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(mockToast).not.toHaveBeenCalled();
    });

    it('認証コードを入力して再送するとログインできる', async () => {
      mockSignIn
        .mockResolvedValueOnce({
          error: 'CredentialsSignin',
          code: 'totp_required',
          ok: false,
          status: 401,
          url: null,
        })
        .mockResolvedValueOnce({
          error: undefined,
          code: undefined,
          ok: true,
          status: 200,
          url: '/',
        });

      render(<LoginForm />);
      await submitCredentials();

      await user.type(await screen.findByLabelText('認証コード'), '123456');
      await user.click(screen.getByRole('button', { name: 'ログイン' }));

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenLastCalledWith(
          'credentials',
          expect.objectContaining({ totpCode: '123456' }),
        );
      });
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('認証コード欄を出していないうちは totpCode を送らない', async () => {
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code: 'totp_required',
        ok: false,
        status: 401,
        url: null,
      });

      render(<LoginForm />);
      await submitCredentials();

      expect(mockSignIn).toHaveBeenCalledWith(
        'credentials',
        expect.not.objectContaining({ totpCode: expect.anything() }),
      );
    });

    it.each([
      ['totp_invalid', '認証コードが正しくありません。'],
      [
        'totp_reused',
        'この認証コードは使用済みです。次のコードが表示されるまでお待ちください。',
      ],
      ['rate_limited', 'しばらく時間をおいてから再度お試しください。'],
    ])('%s を受け取るとその内容を表示する', async (code, message) => {
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code,
        ok: false,
        status: 401,
        url: null,
      });

      render(<LoginForm />);
      await submitCredentials();

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
    });

    it('判別できないコードは認証情報エラーに丸める', async () => {
      // どのアカウントが存在するかを推測させないため
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code: 'credentials',
        ok: false,
        status: 401,
        url: null,
      });

      render(<LoginForm />);
      await submitCredentials();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'メールアドレスまたはパスワードが正しくありません。',
      );
    });
  });

  it('signInが例外をスローした場合にエラーが表示される', async () => {
    mockSignIn.mockRejectedValue(
      new AxiosError('Network error', 'ERR_NETWORK'),
    );

    render(<LoginForm />);

    await user.type(
      screen.getByLabelText('メールアドレスまたはアカウント名'),
      'test@example.com',
    );
    await user.type(screen.getByLabelText('パスワード'), 'Password1');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
  });

  describe('第2要素（メールOTP）', () => {
    // 再送のカウントダウンを進めるため。userEvent にも同じクロックを渡す
    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
    });

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    /** 認証情報を入れて送信する */
    const submitCredentials = async () => {
      await user.type(
        screen.getByLabelText('メールアドレスまたはアカウント名'),
        'user@example.com',
      );
      await user.type(screen.getByLabelText('パスワード'), 'Password1');
      await user.click(screen.getByRole('button', { name: 'ログイン' }));
    };

    const requireEmailOtp = () =>
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code: AUTH_ERROR_CODE.EMAIL_OTP_REQUIRED,
      } as never);

    it('メール向けの文言と再送ボタンを出す', async () => {
      requireEmailOtp();
      render(<LoginForm />);

      await submitCredentials();

      expect(await screen.findByLabelText('認証コード')).toBeInTheDocument();
      expect(
        screen.getByText(/メールに送信した6桁のコード/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: '確認コードを再送信する' }),
      ).toBeInTheDocument();
    });

    it('認証アプリのときは再送ボタンを出さない', async () => {
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code: AUTH_ERROR_CODE.TOTP_REQUIRED,
      } as never);
      render(<LoginForm />);

      await submitCredentials();

      expect(await screen.findByLabelText('認証コード')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '確認コードを再送信する' }),
      ).not.toBeInTheDocument();
    });

    it('再送の直後は押せない（カウントダウン中）', async () => {
      requireEmailOtp();
      render(<LoginForm />);

      await submitCredentials();

      expect(
        await screen.findByRole('button', { name: '確認コードを再送信する' }),
      ).toBeDisabled();
      expect(screen.getByText(/再送信できるまで/)).toBeInTheDocument();
    });

    /**
     * ⚠️ 1通も送られていないので「メールを確認してください」で終わらせない。
     * この状態の出口はリカバリーコードだけ。
     */
    it('送信上限ならリカバリーコードへ誘導する', async () => {
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code: AUTH_ERROR_CODE.SECOND_FACTOR_SEND_LIMITED,
      } as never);
      render(<LoginForm />);

      await submitCredentials();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /リカバリーコード/,
      );
      // 入力欄は出す。手元にリカバリーコードがあれば今すぐ入れられる
      expect(screen.getByLabelText('認証コード')).toBeInTheDocument();
    });

    /**
     * ⚠️ 1通も送られていないのに「再送信できます」と出ると、
     * エラー文と矛盾する。押しても同じエラーが返るだけ
     */
    it('送信上限のときは再送ボタンを出さない', async () => {
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code: AUTH_ERROR_CODE.SECOND_FACTOR_SEND_LIMITED,
      } as never);
      render(<LoginForm />);

      await submitCredentials();
      await screen.findByRole('alert');

      expect(
        screen.queryByRole('button', { name: '確認コードを再送信する' }),
      ).not.toBeInTheDocument();
    });

    /**
     * ⛔ **送信上限でも、受信箱のコードが生きていれば別扱い**
     * （GHSA-p899-6g7w-v7hg）。
     *
     * `EMAIL_OTP_REQUIRED` に混ぜると画面が「今送った」として再送の
     * カウントダウンを振り出しに戻し、60秒後に押しても**メールは出ず・
     * エラーも出ず・何も変わらない**無言の no-op になる。
     * 上限を 10 → 3 に下げたぶん到達しやすい。
     */
    describe('送信上限だが受信箱のコードは有効', () => {
      const mockCodeStillValid = () =>
        mockSignIn.mockResolvedValue({
          error: 'CredentialsSignin',
          code: AUTH_ERROR_CODE.SECOND_FACTOR_CODE_STILL_VALID,
        } as never);

      it('新しくは送っていないことを伝える', async () => {
        mockCodeStillValid();
        render(<LoginForm />);

        await submitCredentials();

        expect(await screen.findByRole('alert')).toHaveTextContent(
          /新しいコードは送っていません/,
        );
        expect(screen.getByLabelText('認証コード')).toBeInTheDocument();
      });

      /** 押しても1通も出ないので出さない */
      it('再送ボタンを出さない', async () => {
        mockCodeStillValid();
        render(<LoginForm />);

        await submitCredentials();
        await screen.findByRole('alert');

        expect(
          screen.queryByRole('button', { name: '確認コードを再送信する' }),
        ).not.toBeInTheDocument();
      });

      /**
       * ⛔ **`sendLimited` を必ず落とす。**
       *
       * 残っているとヒント文が「発行済みのリカバリーコードを入力して
       * ください。」のままで、アラートの「先ほど届いた確認コードを…」と
       * **矛盾した2つの案内が同時に出る**。
       */
      it('先に送信上限だったときも案内が矛盾しない', async () => {
        // 1回目: 出口はリカバリーコードだけ
        mockSignIn.mockResolvedValue({
          error: 'CredentialsSignin',
          code: AUTH_ERROR_CODE.SECOND_FACTOR_SEND_LIMITED,
        } as never);
        render(<LoginForm />);

        await submitCredentials();
        await screen.findByRole('alert');

        // 2回目: 受信箱のコードが有効になった
        mockCodeStillValid();
        await user.click(screen.getByRole('button', { name: 'ログイン' }));

        expect(
          await screen.findByText(/新しいコードは送っていません/),
        ).toBeInTheDocument();
        // ⛔ 「リカバリーコードだけ」の案内に戻っていないこと。
        //    通常のヒント（メールのコードも使える）が出ている
        expect(
          screen.getByText(/メールに送信した6桁のコード/),
        ).toBeInTheDocument();
      });

      /**
       * ⛔ **状態を引きずらない。** 次に送信が通ったら元へ戻す。
       *
       * 戻さないと、新しいコードが届いているのに再送ボタンが消えたまま、
       * 「新しいコードは送っていません」も残り続ける。
       */
      it('次に送信が通ったら元へ戻る', async () => {
        mockCodeStillValid();
        render(<LoginForm />);

        await submitCredentials();
        await screen.findByRole('alert');

        // 再送ボタンは消えている
        expect(
          screen.queryByRole('button', { name: '確認コードを再送信する' }),
        ).not.toBeInTheDocument();

        // コード欄を空のまま送ると `!totpCode` 分岐へ戻る。
        // 2回目は送信できた
        mockSignIn.mockResolvedValue({
          error: 'CredentialsSignin',
          code: AUTH_ERROR_CODE.EMAIL_OTP_REQUIRED,
        } as never);
        await user.click(screen.getByRole('button', { name: 'ログイン' }));

        expect(
          await screen.findByRole('button', {
            name: '確認コードを再送信する',
          }),
        ).toBeInTheDocument();
      });

      /**
       * ⚠️ `sendLimited` と同じ扱いにしない。メールで届いたコードが
       * そのまま使えるので、リカバリーコードだけに絞ると遠回りさせる。
       */
      it('リカバリーコードだけに絞らない', async () => {
        mockCodeStillValid();
        render(<LoginForm />);

        await submitCredentials();
        await screen.findByRole('alert');

        expect(
          screen.getByText(/メールに送信した6桁のコード/),
        ).toBeInTheDocument();
      });
    });

    it('送信上限のときはメールのコードを待たせない', async () => {
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code: AUTH_ERROR_CODE.SECOND_FACTOR_SEND_LIMITED,
      } as never);
      render(<LoginForm />);

      await submitCredentials();
      await screen.findByRole('alert');

      expect(
        screen.queryByText(/メールに送信した6桁のコード/),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(/発行済みのリカバリーコードを入力してください/),
      ).toBeInTheDocument();
    });

    /**
     * ⚠️ 「コードが違う」と同じ文言にすると、届いていないコードを
     * 打ち直し続けることになる（#1148 と同じ理由）。
     */
    it('送信に失敗したら専用の文言を出す', async () => {
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code: AUTH_ERROR_CODE.SECOND_FACTOR_SEND_FAILED,
      } as never);
      render(<LoginForm />);

      await submitCredentials();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/送信できませんでした/);
      expect(alert).not.toHaveTextContent(/正しくありません/);
    });

    /**
     * ⚠️ **入力欄を出さないとログインできなくなる。**
     *
     * 1通も送られていないが、だからこそリカバリーコードが唯一の出口。
     * 入力欄が無いと、手元にコードがあっても入れる場所が無く、
     * Resend の障害が続く限りそのアカウントは一切ログインできない。
     */
    it('送信に失敗してもリカバリーコードを入れられる', async () => {
      mockSignIn.mockResolvedValue({
        error: 'CredentialsSignin',
        code: AUTH_ERROR_CODE.SECOND_FACTOR_SEND_FAILED,
      } as never);
      render(<LoginForm />);

      await submitCredentials();

      expect(await screen.findByLabelText('認証コード')).toBeInTheDocument();
      expect(
        screen.getByText(/発行済みのリカバリーコードを入力してください/),
      ).toBeInTheDocument();
    });

    /**
     * ⚠️ 毎秒変わる値を live region に入れない。polite のキューに60件の
     * アナウンスが積まれ、読み上げが追いつかずカウント中は実質
     * スクリーンリーダーで操作できなくなる
     */
    it('残り秒数を live region にしない', async () => {
      requireEmailOtp();
      render(<LoginForm />);

      await submitCredentials();

      const hint = await screen.findByText(/再送信できるまで/);
      expect(hint).not.toHaveAttribute('aria-live');
    });

    /**
     * ⚠️ onSubmit は totpRequired のとき**常に** totpCode を送る。
     * 打ち間違えた状態で再送を押すとそのコードが検証され、
     * TOTP_VERIFY（5回/15分）の枠を1つ失う。
     *
     * state のクリアは同期的に反映されないので、ref で確実に飛ばしている。
     */
    it('再送は入力済みのコードを送らない', async () => {
      requireEmailOtp();
      render(<LoginForm />);
      await submitCredentials();

      await user.type(await screen.findByLabelText('認証コード'), '000000');

      // ⚠️ removeAttribute では React 管理の disabled を外せず、
      // userEvent がクリックを握り潰して最初の送信を見てしまう。
      // タイマーを進めて本当に押せる状態にする
      await act(async () => {
        jest.advanceTimersByTime(OTP_CONFIG.RESEND_INTERVAL_SECONDS * 1000);
      });

      await user.click(
        screen.getByRole('button', { name: '確認コードを再送信する' }),
      );

      // ⚠️ クリックが実際に発火したことを先に確かめる。
      // 発火していないと、最初の送信（コード未入力）を見て緑になる
      expect(mockSignIn).toHaveBeenCalledTimes(2);

      const lastCall = mockSignIn.mock.calls.at(-1);
      expect(lastCall?.[1]).not.toHaveProperty('totpCode');
    });

    it('コードを入れて送信するときは totpCode を送る', async () => {
      requireEmailOtp();
      render(<LoginForm />);
      await submitCredentials();

      await user.type(await screen.findByLabelText('認証コード'), '123456');
      await user.click(screen.getByRole('button', { name: 'ログイン' }));

      const lastCall = mockSignIn.mock.calls.at(-1);
      expect(lastCall?.[1]).toMatchObject({ totpCode: '123456' });
    });
  });
});
