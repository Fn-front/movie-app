import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PASSWORD_RESET_MESSAGES } from '@/constants/passwordReset';

import { ResetPasswordForm } from './resetPasswordForm';

// --- Mocks ---

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockCleanUpBeforeSignOut = jest.fn();
jest.mock('@/lib/auth/logout', () => ({
  cleanUpBeforeSignOut: () => mockCleanUpBeforeSignOut(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

const okResponse = () => ({
  ok: true,
  status: 200,
  json: async () => ({
    success: true,
    message: PASSWORD_RESET_MESSAGES.RESET_COMPLETED,
  }),
});

const errorResponse = (status: number, message: string) => ({
  ok: false,
  status,
  json: async () => ({ success: false, error: { message } }),
});

// --- Tests ---

describe('ResetPasswordForm', () => {
  const user = userEvent.setup();
  const VALID_PASSWORD = 'NewPassword1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** 新しいパスワードを入力して送信する */
  const submitPassword = async (
    password: string,
    confirmPassword = password,
  ) => {
    await user.type(screen.getByLabelText('新しいパスワード'), password);
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      confirmPassword,
    );
    await user.click(
      screen.getByRole('button', { name: 'パスワードを再設定' }),
    );
  };

  it('トークンがあればフォームを表示する', () => {
    render(<ResetPasswordForm token='valid-token' />);

    expect(
      screen.getByRole('heading', { name: '新しいパスワードの設定' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
    expect(
      screen.getByLabelText('新しいパスワード（確認）'),
    ).toBeInTheDocument();
  });

  it('トークンが無ければフォームを出さず案内する', () => {
    render(<ResetPasswordForm />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      PASSWORD_RESET_MESSAGES.TOKEN_MISSING,
    );
    expect(screen.queryByLabelText('新しいパスワード')).not.toBeInTheDocument();
  });

  it('トークンと新しいパスワードを送信する', async () => {
    mockFetch.mockResolvedValue(okResponse());

    render(<ResetPasswordForm token='valid-token' />);
    await submitPassword(VALID_PASSWORD);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth/password-reset/confirm',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            token: 'valid-token',
            password: VALID_PASSWORD,
          }),
        }),
      );
    });
  });

  it('再設定に成功したらログイン画面へ遷移する', async () => {
    // 再設定で既存セッションが失効するため、ログインし直してもらう
    mockFetch.mockResolvedValue(okResponse());

    render(<ResetPasswordForm token='valid-token' />);
    await submitPassword(VALID_PASSWORD);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/auth/signin');
    });
  });

  /**
   * ログイン中に行われた同意を端末に残さない（#1234）
   *
   * サーバーがセッションCookieを失効させるが、`logout()` を通らないので
   * 後始末が走らない。`useSession` はポーリングしないため status は
   * `authenticated` のまま据え置かれ、`useConsentServerSync` の保険も
   * 発火しない。残すと、このままタブを閉じた端末を次に使った人へ前の
   * 利用者の同意が1ページロード分適用される
   */
  it('再設定に成功したら、ログイン中の同意レコードを消す', async () => {
    mockFetch.mockResolvedValue(okResponse());

    render(<ResetPasswordForm token='valid-token' />);
    await submitPassword(VALID_PASSWORD);

    await waitFor(() => {
      expect(mockCleanUpBeforeSignOut).toHaveBeenCalled();
    });
  });

  it('再設定に失敗したら同意レコードは消さない', async () => {
    // 設定していないのに同意まで消される理由が無い
    mockFetch.mockResolvedValue(
      errorResponse(400, PASSWORD_RESET_MESSAGES.INVALID_TOKEN),
    );

    render(<ResetPasswordForm token='bad-token' />);
    await submitPassword(VALID_PASSWORD);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(mockCleanUpBeforeSignOut).not.toHaveBeenCalled();
  });

  it('確認用パスワードが一致しなければ送信しない', async () => {
    render(<ResetPasswordForm token='valid-token' />);
    await submitPassword(VALID_PASSWORD, 'DifferentPassword1');

    expect(
      await screen.findByText('パスワードが一致しません'),
    ).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([
    ['短すぎる', 'Ab1'],
    ['大文字なし', 'password1'],
    ['小文字なし', 'PASSWORD1'],
    ['数字なし', 'PasswordAb'],
  ])('パスワードポリシー違反（%s）では送信しない', async (_label, password) => {
    render(<ResetPasswordForm token='valid-token' />);
    await submitPassword(password);

    await waitFor(() => {
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  it('無効なトークンのエラーを表示する', async () => {
    mockFetch.mockResolvedValue(
      errorResponse(400, PASSWORD_RESET_MESSAGES.INVALID_TOKEN),
    );

    render(<ResetPasswordForm token='used-token' />);
    await submitPassword(VALID_PASSWORD);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      PASSWORD_RESET_MESSAGES.INVALID_TOKEN,
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('新旧パスワード同一のエラーを表示する', async () => {
    mockFetch.mockResolvedValue(
      errorResponse(400, PASSWORD_RESET_MESSAGES.SAME_PASSWORD),
    );

    render(<ResetPasswordForm token='valid-token' />);
    await submitPassword(VALID_PASSWORD);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      PASSWORD_RESET_MESSAGES.SAME_PASSWORD,
    );
  });

  it('通信に失敗したらエラーを表示する', async () => {
    mockFetch.mockRejectedValue(new Error('network'));

    render(<ResetPasswordForm token='valid-token' />);
    await submitPassword(VALID_PASSWORD);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('再送リンクを表示する', () => {
    // 期限切れのリンクを開いた利用者がここで詰まないようにする
    render(<ResetPasswordForm token='expired-token' />);

    expect(
      screen.getByRole('link', { name: '再設定リンクを再送する' }),
    ).toHaveAttribute('href', '/auth/forgot-password');
  });

  describe('admin 発行アカウントの設定リンクから来たとき', () => {
    it('再送リンクを出さない', () => {
      // 発行アカウントの `users.email` は受信できない合成アドレス
      // （`<ランダム>@<ランダム>.invalid`）。再送を押しても列挙防止で
      // 「送信しました」が返るだけで、何も届かない行き止まりになる
      render(<ResetPasswordForm token='expired-token' isIssuedAccount />);

      expect(
        screen.queryByRole('link', { name: '再設定リンクを再送する' }),
      ).not.toBeInTheDocument();
    });

    it('発行元の管理者へ依頼するよう案内する', () => {
      // 復旧経路は admin の再発行だけ
      render(<ResetPasswordForm token='expired-token' isIssuedAccount />);

      expect(
        screen.getByText(PASSWORD_RESET_MESSAGES.ISSUED_ACCOUNT_RESEND),
      ).toBeInTheDocument();
    });

    it('トークンが無くても案内は出す', () => {
      // リンクが壊れて token が落ちた場合でも、次の行動が分かるようにする
      render(<ResetPasswordForm isIssuedAccount />);

      expect(
        screen.getByText(PASSWORD_RESET_MESSAGES.ISSUED_ACCOUNT_RESEND),
      ).toBeInTheDocument();
    });
  });

  it('通常の利用者には管理者への案内を出さない', () => {
    render(<ResetPasswordForm token='expired-token' />);

    expect(
      screen.queryByText(PASSWORD_RESET_MESSAGES.ISSUED_ACCOUNT_RESEND),
    ).not.toBeInTheDocument();
  });
});
