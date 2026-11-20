import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TwoFactorChallenge } from './twoFactorChallenge';

// --- Mocks ---

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const mockUpdate = jest.fn();
let mockSessionData: Record<string, unknown> | null = null;
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: mockSessionData, update: mockUpdate }),
}));

const mockLogout = jest.fn();
jest.mock('@/lib/auth/logout', () => ({
  logout: (...args: unknown[]) => mockLogout(...args),
}));

// --- Tests ---

describe('TwoFactorChallenge', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
    // 既定は認証アプリ（既存テストの前提）
    mockSessionData = null;
    // 既定は成功（本物の logout は遷移するので解決後に戻ってこない）
    mockLogout.mockResolvedValue(undefined);
  });

  /** 認証コードを入力して確認を押す */
  const submitCode = async (code: string) => {
    await user.type(screen.getByLabelText('認証コード'), code);
    await user.click(screen.getByRole('button', { name: '認証コードを確認' }));
  };

  /** この画面から抜けるボタン */
  const cancelButton = () =>
    screen.getByRole('button', { name: 'キャンセルしてログアウト' });

  it('入力欄と説明を表示する', () => {
    render(<TwoFactorChallenge />);

    expect(
      screen.getByRole('heading', { name: '二段階認証' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('認証コード')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '認証コードを確認' }),
    ).toBeInTheDocument();
  });

  it('リカバリーコードでも進めることを案内する', () => {
    // 認証アプリを失った利用者がここで詰まないようにする。
    // ⚠️ `/リカバリーコード/` だけだと、抜ける導線の案内文にも当たって
    // 2件になる（#1161）。この案内が出ていることを文単位で見る
    render(<TwoFactorChallenge />);

    expect(
      screen.getByText(/発行済みのリカバリーコードでも進めます/),
    ).toBeInTheDocument();
  });

  it('入力したコードをサーバーへ渡す', async () => {
    mockUpdate.mockResolvedValue({ totpPending: false });

    render(<TwoFactorChallenge />);
    await submitCode('123456');

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ totpCode: '123456' });
    });
  });

  it('前後の空白を落として渡す', async () => {
    mockUpdate.mockResolvedValue({ totpPending: false });

    render(<TwoFactorChallenge />);
    await submitCode('  123456  ');

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ totpCode: '123456' });
    });
  });

  it('検証に成功すると戻り先へ遷移する', async () => {
    mockUpdate.mockResolvedValue({ totpPending: false });

    render(<TwoFactorChallenge callbackUrl='/watchlist' />);
    await submitCode('123456');

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/watchlist');
    });
  });

  it('戻り先が無ければホームへ遷移する', async () => {
    mockUpdate.mockResolvedValue({ totpPending: false });

    render(<TwoFactorChallenge />);
    await submitCode('123456');

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('外部URLの戻り先は拒否してホームへ遷移する', async () => {
    // オープンリダイレクトを踏ませない
    mockUpdate.mockResolvedValue({ totpPending: false });

    render(<TwoFactorChallenge callbackUrl='https://evil.com/steal' />);
    await submitCode('123456');

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/');
    });
  });

  it('検証に失敗するとエラーを表示し遷移しない', async () => {
    mockUpdate.mockResolvedValue({ totpPending: true });

    render(<TwoFactorChallenge />);
    await submitCode('000000');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '認証コードが正しくありません。',
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('検証に失敗したら入力欄を空にする', async () => {
    mockUpdate.mockResolvedValue({ totpPending: true });

    render(<TwoFactorChallenge />);
    await submitCode('000000');

    await waitFor(() => {
      expect(screen.getByLabelText('認証コード')).toHaveValue('');
    });
  });

  it('更新が例外になってもエラーを表示する', async () => {
    mockUpdate.mockRejectedValue(new Error('network'));

    render(<TwoFactorChallenge />);
    await submitCode('123456');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('セッションが返らない場合もエラーとして扱う', async () => {
    mockUpdate.mockResolvedValue(null);

    render(<TwoFactorChallenge />);
    await submitCode('123456');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('未入力では送信しない', async () => {
    render(<TwoFactorChallenge />);

    await user.click(screen.getByRole('button', { name: '認証コードを確認' }));

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('空白だけの入力では送信しない', async () => {
    render(<TwoFactorChallenge />);
    await submitCode('   ');

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('失敗の内訳を画面に出さない', async () => {
    // 不正 / 使い回し / 試行上限 を区別すると、総当たりする側に手がかりを与える
    mockUpdate.mockResolvedValue({ totpPending: true });

    render(<TwoFactorChallenge />);
    await submitCode('000000');

    const alert = await screen.findByRole('alert');

    expect(alert).not.toHaveTextContent('使用済み');
    expect(alert).not.toHaveTextContent('しばらく時間をおいて');
  });

  /**
   * 「コードが違う」と「確認できなかった」を分ける（#1148）
   *
   * jwt コールバックが DB の不調で検証そのものに失敗した場合、入れ直しても
   * 直らない。同じ「認証コードが正しくありません」を出すと、利用者は
   * 正しいコードを繰り返し打ち続けることになる。
   *
   * ⚠️ 失敗の**内訳**（不正 / 使い回し / 試行上限）は従来どおり伏せたまま。
   * 分けるのは「そもそも確認できたかどうか」だけで、総当たりの手がかりには
   * ならない（確認できなければコードの正誤は判定されていない）。
   */
  describe('検証できなかった場合', () => {
    const unavailable = { totpPending: true, totpUnavailable: true };

    it('一時的に確認できない旨を表示する', async () => {
      mockUpdate.mockResolvedValue(unavailable);

      render(<TwoFactorChallenge />);
      await submitCode('123456');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '認証コードを確認できませんでした。時間をおいてもう一度お試しください。',
      );
    });

    it('「正しくありません」とは言わない', async () => {
      mockUpdate.mockResolvedValue(unavailable);

      render(<TwoFactorChallenge />);
      await submitCode('123456');

      expect(await screen.findByRole('alert')).not.toHaveTextContent(
        '正しくありません',
      );
    });

    // 打ち直しではなく、時間をおいた再試行を促したい
    it('入力を消さない', async () => {
      mockUpdate.mockResolvedValue(unavailable);

      render(<TwoFactorChallenge />);
      await submitCode('123456');

      await screen.findByRole('alert');
      expect(screen.getByLabelText('認証コード')).toHaveValue('123456');
    });

    it('遷移しない', async () => {
      mockUpdate.mockResolvedValue(unavailable);

      render(<TwoFactorChallenge />);
      await submitCode('123456');

      await screen.findByRole('alert');
      expect(mockPush).not.toHaveBeenCalled();
    });

    // 検証できたうえで弾かれた場合は従来どおり
    it('コードが違うだけなら従来の文言のまま', async () => {
      mockUpdate.mockResolvedValue({ totpPending: true });

      render(<TwoFactorChallenge />);
      await submitCode('000000');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '認証コードが正しくありません。',
      );
    });

    // DB が復旧すればそのまま通過できる（#1148 の完了条件）
    it('再試行して成功すれば遷移する', async () => {
      mockUpdate.mockResolvedValueOnce(unavailable);

      render(<TwoFactorChallenge />);
      await submitCode('123456');
      await screen.findByRole('alert');

      mockUpdate.mockResolvedValue({ totpPending: false });
      await user.click(
        screen.getByRole('button', { name: '認証コードを確認' }),
      );

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });
  });

  /**
   * この画面からの出口（#1161）
   *
   * `totpPending` のセッションは proxy が他のすべての画面から押し戻すため、
   * ログアウト以外に出口が無い。認証アプリもリカバリーコードも手元に無い
   * 利用者は、これが無いと Cookie を手で消すまで公開ページすら見られない。
   */
  describe('コード入力画面から抜ける', () => {
    it('ログアウトの導線を表示する', () => {
      render(<TwoFactorChallenge />);

      expect(cancelButton()).toBeInTheDocument();
    });

    it('別のアカウントでログインし直せることを案内する', () => {
      render(<TwoFactorChallenge />);

      expect(screen.getByText(/別のアカウントでログイン/)).toBeInTheDocument();
    });

    it('押すとログアウトする', async () => {
      render(<TwoFactorChallenge />);

      await user.click(cancelButton());

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });

    // ログアウトはコードの検証と無関係なので、入力が空でも押せる必要がある。
    // 認証アプリが手元に無い利用者はそもそも入力できない
    it('コードが未入力でも押せる', async () => {
      render(<TwoFactorChallenge />);

      expect(cancelButton()).toBeEnabled();

      await user.click(cancelButton());

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
    });

    it('コードの検証を発火しない', async () => {
      render(<TwoFactorChallenge />);

      await user.click(cancelButton());

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('ログアウトに失敗したらエラーを表示する', async () => {
      // `logout()` は csrf 取得か /signout の POST が失敗すると rethrow する。
      // 画面に留まるので、黙って固まらせない
      mockLogout.mockRejectedValue(new Error('network'));

      render(<TwoFactorChallenge />);
      await user.click(cancelButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'ログアウトできませんでした。',
      );
    });

    it('ログアウトに失敗しても押し直せる', async () => {
      mockLogout.mockRejectedValueOnce(new Error('network'));

      render(<TwoFactorChallenge />);
      await user.click(cancelButton());
      await screen.findByRole('alert');

      await waitFor(() => {
        expect(cancelButton()).toBeEnabled();
      });

      await user.click(cancelButton());

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalledTimes(2);
      });
    });

    // ログアウト中に検証が走ると、signOut の Cookie 削除と検証成功による
    // 再発行の順序が決まらない。DOM の disabled だけに頼らない
    it('ログアウト中はコードを検証しない', async () => {
      let finishLogout: () => void = () => {};
      mockLogout.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishLogout = resolve;
        }),
      );

      render(<TwoFactorChallenge />);
      await user.type(screen.getByLabelText('認証コード'), '123456');
      await user.click(cancelButton());

      await waitFor(() => {
        expect(mockLogout).toHaveBeenCalled();
      });

      // disabled を迂回してフォームを直接送信しても受け付けない
      fireEvent.submit(screen.getByLabelText('認証コード').closest('form')!);

      expect(mockUpdate).not.toHaveBeenCalled();

      await act(async () => {
        finishLogout();
      });
    });

    it('コードの検証中は押せない', async () => {
      // 二重操作で `update` と `signOut` が競合しないようにする。
      // ⚠️ `Once` にする。`jest.clearAllMocks()` は mockImplementation を
      // 消さないので、`mockReturnValue` だと後ろに足したテストへ
      // 「解決しない Promise」が漏れる
      let resolveUpdate: (value: unknown) => void = () => {};
      mockUpdate.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
      );

      render(<TwoFactorChallenge />);
      await submitCode('123456');

      await waitFor(() => {
        expect(cancelButton()).toBeDisabled();
      });

      // 握ったままテストを終えると、後続の state 更新が act の外で走る
      await act(async () => {
        resolveUpdate({ totpPending: false });
      });
    });
  });

  describe('第2要素がメールのコード', () => {
    beforeEach(() => {
      mockSessionData = {
        totpPending: true,
        secondFactorMethod: 'email_otp',
      };
    });

    it('メール向けのリード文を出す', () => {
      render(<TwoFactorChallenge />);

      expect(
        screen.getByText(/メールに送信した6桁のコード/),
      ).toBeInTheDocument();
    });

    it('再送ボタンを出す', () => {
      render(<TwoFactorChallenge />);

      expect(
        screen.getByRole('button', { name: '確認コードを再送信する' }),
      ).toBeInTheDocument();
    });

    it('認証アプリのときは再送ボタンを出さない', () => {
      mockSessionData = { totpPending: true, secondFactorMethod: 'totp' };

      render(<TwoFactorChallenge />);

      expect(
        screen.queryByRole('button', { name: '確認コードを再送信する' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(/認証アプリに表示されている6桁のコード/),
      ).toBeInTheDocument();
    });

    it('カウントダウン中は押せない', () => {
      render(<TwoFactorChallenge />);

      expect(
        screen.getByRole('button', { name: '確認コードを再送信する' }),
      ).toBeDisabled();
      expect(screen.getByText(/再送信できるまで/)).toBeInTheDocument();
    });

    /**
     * ⚠️ 毎秒変わる値を live region に入れない。polite のキューに60件の
     * アナウンスが積まれ、読み上げが追いつかずカウント中は実質
     * スクリーンリーダーで操作できなくなる。
     * 既存の `otpVerification` も同じカウントダウンに付けていない。
     */
    it('残り秒数を live region にしない', () => {
      render(<TwoFactorChallenge />);

      expect(screen.getByText(/再送信できるまで/)).not.toHaveAttribute(
        'aria-live',
      );
    });

    it('脱出導線の文言もメール向けにする', () => {
      render(<TwoFactorChallenge />);

      expect(screen.getByText(/メールが受け取れず/)).toBeInTheDocument();
    });

    /**
     * ⚠️ NextAuth の JWT はステートレスで、update() は
     * 「Cookie を読む → jwt → 書き戻す」を独立に行う。
     * 再送（Resend の往復で遅い）と検証（速い）が並行すると、
     * 再送が**後から** totpPending: true を書き戻し、
     * 成功したはずの検証が巻き戻る。
     */
    it('検証中は再送を押せない', async () => {
      // 解決しない update で「検証中」に固定する
      mockUpdate.mockReturnValue(new Promise(() => {}));
      render(<TwoFactorChallenge />);

      await user.type(screen.getByLabelText('認証コード'), '123456');
      await user.click(
        screen.getByRole('button', { name: '認証コードを確認' }),
      );

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: '確認コードを再送信する' }),
        ).toBeDisabled();
      });
    });

    it('再送中は確認もキャンセルも押せない', async () => {
      jest.useFakeTimers();
      const timerUser = userEvent.setup({
        advanceTimers: jest.advanceTimersByTime,
      });

      try {
        render(<TwoFactorChallenge />);

        // カウントダウンを明けさせる
        await act(async () => {
          jest.advanceTimersByTime(60_000);
        });

        // 解決しない update で「再送中」に固定する
        mockUpdate.mockReturnValue(new Promise(() => {}));
        await timerUser.click(
          screen.getByRole('button', { name: '確認コードを再送信する' }),
        );

        expect(
          screen.getByRole('button', { name: '認証コードを確認' }),
        ).toBeDisabled();
        expect(
          screen.getByRole('button', { name: 'キャンセルしてログアウト' }),
        ).toBeDisabled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('再送は update({ resend: true }) を呼ぶ', async () => {
      jest.useFakeTimers();
      const timerUser = userEvent.setup({
        advanceTimers: jest.advanceTimersByTime,
      });

      try {
        mockUpdate.mockResolvedValue({ totpPending: true });
        render(<TwoFactorChallenge />);

        await act(async () => {
          jest.advanceTimersByTime(60_000);
        });

        await timerUser.click(
          screen.getByRole('button', { name: '確認コードを再送信する' }),
        );

        expect(mockUpdate).toHaveBeenCalledWith({ resend: true });
      } finally {
        jest.useRealTimers();
      }
    });

    /**
     * ⚠️ jwt コールバックからは例外を出せないため（#1148）、送信の失敗は
     * セッションのフラグでしか届かない。読まないと、1通も送られていないのに
     * 「メールに送信した6桁のコードを入力してください」と出て、利用者は
     * 届かないコードを待ち続ける。
     */
    it('送信に失敗したら「送った」と言わない', () => {
      mockSessionData = {
        totpPending: true,
        secondFactorMethod: 'email_otp',
        secondFactorSendFailed: true,
      };

      render(<TwoFactorChallenge />);

      expect(
        screen.queryByText(/メールに送信した6桁のコード/),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(
        /送信できませんでした/,
      );
    });

    /**
     * ⚠️ 送信上限は「待っても送られない」。リカバリーコードへ誘導しないと
     * 利用者の手が止まる。
     */
    it('送信上限ならリカバリーコードへ誘導する', () => {
      mockSessionData = {
        totpPending: true,
        secondFactorMethod: 'email_otp',
        secondFactorSendLimited: true,
      };

      render(<TwoFactorChallenge />);

      expect(
        screen.queryByText(/メールに送信した6桁のコード/),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(/リカバリーコード/);
    });

    /**
     * ⚠️ 上限中は再送ボタンを出さない。
     *
     * 押しても同じ 429 が返るだけで、出口はリカバリーコードしかない。
     * 「リカバリーコードを入力してください」の隣に「再送信できます。」が
     * 並ぶと、利用者はそちらを押し続けてしまう。
     *
     * `loginForm` は以前から `!sendLimited` で隠していたが、こちらは
     * 見ていなかった。第2要素の送信失敗で枠を戻さなくなり（歯止めを
     * 残すため）、この状態に現実的に到達するようになった。
     */
    it('送信上限なら再送ボタンを出さない', () => {
      mockSessionData = {
        totpPending: true,
        secondFactorMethod: 'email_otp',
        secondFactorSendLimited: true,
      };

      render(<TwoFactorChallenge />);

      expect(
        screen.queryByRole('button', { name: '確認コードを再送信する' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('再送信できます。')).not.toBeInTheDocument();
    });

    it('送信できていれば通常のリード文を出す', () => {
      render(<TwoFactorChallenge />);

      expect(
        screen.getByText(/メールに送信した6桁のコード/),
      ).toBeInTheDocument();
    });
  });
});
