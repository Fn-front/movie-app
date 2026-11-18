import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PASSWORD_RESET_MESSAGES } from '@/constants/passwordReset';

import { ForgotPasswordForm } from './forgotPasswordForm';

// --- Mocks ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** 成功レスポンス */
const okResponse = () => ({
  ok: true,
  status: 200,
  json: async () => ({
    success: true,
    message: PASSWORD_RESET_MESSAGES.REQUEST_ACCEPTED,
  }),
});

/** エラーレスポンス */
const errorResponse = (status: number, message: string) => ({
  ok: false,
  status,
  json: async () => ({ success: false, error: { message } }),
});

// --- Tests ---

describe('ForgotPasswordForm', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** メールアドレスを入力して送信する */
  const submitEmail = async (email: string) => {
    await user.type(screen.getByLabelText('メールアドレス'), email);
    await user.click(
      screen.getByRole('button', { name: '再設定リンクを送信' }),
    );
  };

  it('フォームを表示する', () => {
    render(<ForgotPasswordForm />);

    expect(
      screen.getByRole('heading', { name: 'パスワードの再設定' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'ログイン画面に戻る' }),
    ).toHaveAttribute('href', '/auth/signin');
  });

  it('入力したメールアドレスを送信する', async () => {
    mockFetch.mockResolvedValue(okResponse());

    render(<ForgotPasswordForm />);
    await submitEmail('user@example.com');

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth/password-reset/request',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'user@example.com' }),
        }),
      );
    });
  });

  it('送信後は案内を表示し入力欄を隠す', async () => {
    mockFetch.mockResolvedValue(okResponse());

    render(<ForgotPasswordForm />);
    await submitEmail('user@example.com');

    expect(
      await screen.findByText(PASSWORD_RESET_MESSAGES.REQUEST_ACCEPTED),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('メールアドレス')).not.toBeInTheDocument();
  });

  /**
   * この画面では復旧できない人に、理由の心当たりを渡す（#1226）
   *
   * 発行アカウントの `users.email` は受信できない合成アドレスで、本人も
   * それを知らない。実アドレスを入れても引けないが、列挙防止のため応答は
   * 成功と同じ。「送信しました」と出たまま永久に届かない
   */
  describe('発行アカウントの案内', () => {
    it('送信する前に出す', () => {
      render(<ForgotPasswordForm />);

      expect(
        screen.getByText(PASSWORD_RESET_MESSAGES.ISSUED_ACCOUNT_NOT_SUPPORTED),
      ).toBeInTheDocument();
    });

    it('送信した後にも出す', async () => {
      // ⚠️ ここが本題。送信前の注記は読み飛ばされるが、届かないことに
      // 気づいたあと戻ってくる場所はこちら
      mockFetch.mockResolvedValue(okResponse());

      render(<ForgotPasswordForm />);
      await submitEmail('user@example.com');

      await screen.findByText(PASSWORD_RESET_MESSAGES.REQUEST_ACCEPTED);

      expect(
        screen.getByText(PASSWORD_RESET_MESSAGES.ISSUED_ACCOUNT_NOT_SUPPORTED),
      ).toBeInTheDocument();
    });

    it('送信後の案内と同じライブリージョンに入れる', async () => {
      // 「送信しました」だけを包むと、届かない理由に心当たりを持てる唯一の
      // 文言がライブリージョンの外に出て、支援技術には読まれない
      mockFetch.mockResolvedValue(okResponse());

      render(<ForgotPasswordForm />);
      await submitEmail('user@example.com');

      const status = await screen.findByRole('status');

      expect(status).toHaveTextContent(
        PASSWORD_RESET_MESSAGES.REQUEST_ACCEPTED,
      );
      expect(status).toHaveTextContent(
        PASSWORD_RESET_MESSAGES.ISSUED_ACCOUNT_NOT_SUPPORTED,
      );
    });

    it.each([
      ['試行上限（429）', 429, 'しばらく時間をおいてから再度お試しください。'],
      ['サーバーエラー（500）', 500, PASSWORD_RESET_MESSAGES.RESET_FAILED],
    ])('%s でも案内は消えない', async (_label, status, message) => {
      // 応答によって出たり消えたりすると、どのメールアドレスが登録済みかを
      // 推測する手がかりになる
      mockFetch.mockResolvedValue(errorResponse(status, message));

      render(<ForgotPasswordForm />);
      await submitEmail('user@example.com');

      await screen.findByRole('alert');

      expect(
        screen.getByText(PASSWORD_RESET_MESSAGES.ISSUED_ACCOUNT_NOT_SUPPORTED),
      ).toBeInTheDocument();
    });
  });

  it('未登録のメールでも同じ案内を表示する', async () => {
    // 文面が変わると、どのメールアドレスが登録済みかを総当たりで調べられる
    mockFetch.mockResolvedValue(okResponse());

    render(<ForgotPasswordForm />);
    await submitEmail('nobody@example.com');

    expect(
      await screen.findByText(PASSWORD_RESET_MESSAGES.REQUEST_ACCEPTED),
    ).toBeInTheDocument();
  });

  it.each([
    ['未入力', ''],
    ['形式が不正', 'not-an-email'],
  ])('%s ならバリデーションエラーを表示し送信しない', async (_label, email) => {
    render(<ForgotPasswordForm />);

    if (email) {
      await user.type(screen.getByLabelText('メールアドレス'), email);
    }
    await user.click(
      screen.getByRole('button', { name: '再設定リンクを送信' }),
    );

    await waitFor(() => {
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  it('試行上限のエラーを表示する', async () => {
    mockFetch.mockResolvedValue(
      errorResponse(429, 'しばらく時間をおいてから再度お試しください。'),
    );

    render(<ForgotPasswordForm />);
    await submitEmail('user@example.com');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'しばらく時間をおいてから再度お試しください。',
    );
  });

  it('エラー時は案内を表示しない', async () => {
    mockFetch.mockResolvedValue(
      errorResponse(500, PASSWORD_RESET_MESSAGES.RESET_FAILED),
    );

    render(<ForgotPasswordForm />);
    await submitEmail('user@example.com');

    await screen.findByRole('alert');
    expect(
      screen.queryByText(PASSWORD_RESET_MESSAGES.REQUEST_ACCEPTED),
    ).not.toBeInTheDocument();
  });

  it('通信に失敗したらネットワークエラーを表示する', async () => {
    mockFetch.mockRejectedValue(new Error('network'));

    render(<ForgotPasswordForm />);
    await submitEmail('user@example.com');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
