import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';

import { PASSWORD_CHANGE_EVENT } from '@/constants/auth';

import { ChangePasswordForm } from './changePasswordForm';

// --- Mocks ---

const mockToast = jest.fn();
jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ toast: mockToast }),
  useToastDispatch: () => ({ toast: mockToast }),
}));

const mockSendOtp = jest.fn();
const mockChangePassword = jest.fn();
jest.mock('@/lib/api/auth/auth', () => ({
  sendOtp: (...args: unknown[]) => mockSendOtp(...args),
  changePassword: (...args: unknown[]) => mockChangePassword(...args),
}));

jest.mock('@/features/auth/otpVerification/otpVerification', () => ({
  OtpVerification: ({
    email,
    onVerifySuccess,
    headingLevel,
  }: {
    email: string;
    action: string;
    onVerifySuccess?: (verificationToken?: string) => void;
    headingLevel?: number;
  }) => (
    <div
      data-testid='otp-verification'
      data-heading-level={headingLevel ?? 'default'}
    >
      <span data-testid='otp-email'>{email}</span>
      <button
        onClick={() => onVerifySuccess?.('verification-token')}
        data-testid='otp-verify-success'
      >
        検証成功
      </button>
      {/* トークンを発行しないケース（検証未完了相当）の再現用 */}
      <button
        onClick={() => onVerifySuccess?.(undefined)}
        data-testid='otp-verify-success-without-token'
      >
        検証成功（トークンなし）
      </button>
    </div>
  ),
}));

// --- Helpers ---

const user = userEvent.setup();
const defaultEmail = 'test@example.com';

/** OTP送信 → OTP検証成功 → 新パスワード入力画面まで遷移するヘルパー */
const goToNewPasswordStep = async () => {
  mockSendOtp.mockResolvedValueOnce({ success: true });

  render(<ChangePasswordForm email={defaultEmail} hasPassword />);

  await user.click(screen.getByRole('button', { name: '確認コードを送信' }));

  await waitFor(() => {
    expect(screen.getByTestId('otp-verification')).toBeInTheDocument();
    // ここはステップとしての埋め込み。ページの h1 は残るので既定（h2）のまま（#1249）
    expect(screen.getByTestId('otp-verification')).toHaveAttribute(
      'data-heading-level',
      'default',
    );
  });

  await user.click(screen.getByTestId('otp-verify-success'));

  await waitFor(() => {
    expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
  });
};

// --- Tests ---

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('初期状態で確認コード送信ボタンが表示される', () => {
    render(<ChangePasswordForm email={defaultEmail} hasPassword />);

    expect(
      screen.getByText(
        'パスワードを変更するには、メールアドレスに確認コードを送信します。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '確認コードを送信' }),
    ).toBeInTheDocument();
  });

  it('確認コード送信成功時にOTP検証画面に遷移する', async () => {
    mockSendOtp.mockResolvedValueOnce({ success: true });

    render(<ChangePasswordForm email={defaultEmail} hasPassword />);

    await user.click(screen.getByRole('button', { name: '確認コードを送信' }));

    await waitFor(() => {
      expect(mockSendOtp).toHaveBeenCalledWith({
        email: defaultEmail,
        action: 'password_change',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('otp-verification')).toBeInTheDocument();
      expect(screen.getByTestId('otp-email')).toHaveTextContent(defaultEmail);
    });
  });

  it('確認コード送信失敗時にエラーが表示される', async () => {
    mockSendOtp.mockRejectedValueOnce(
      new AxiosError('Send failed', 'ERR_BAD_REQUEST'),
    );

    render(<ChangePasswordForm email={defaultEmail} hasPassword />);

    await user.click(screen.getByRole('button', { name: '確認コードを送信' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // OTP検証画面には遷移しない
    expect(screen.queryByTestId('otp-verification')).not.toBeInTheDocument();
  });

  it('OTP検証成功後に新パスワード入力フォームが表示される', async () => {
    await goToNewPasswordStep();

    expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
    expect(
      screen.getByLabelText('新しいパスワード（確認）'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '変更する' }),
    ).toBeInTheDocument();
  });

  it('新パスワードが短すぎるとバリデーションエラーが表示される', async () => {
    await goToNewPasswordStep();

    await user.type(screen.getByLabelText('新しいパスワード'), 'Pw1');
    await user.type(screen.getByLabelText('新しいパスワード（確認）'), 'Pw1');
    await user.click(screen.getByRole('button', { name: '変更する' }));

    await waitFor(() => {
      expect(
        screen.getByText('パスワードは12文字以上で入力してください'),
      ).toBeInTheDocument();
    });
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  // bcrypt は72バイトで黙って切り詰めるため、上限を超える入力は受け付けない（#652）
  it.each([
    ['ASCII 73バイト', `Aa1${'x'.repeat(70)}`],
    // 26文字しかないが75バイト。文字数で判定していたら通ってしまう
    ['日本語を含む75バイト', `Aa1${'あ'.repeat(24)}`],
  ])(
    '新パスワードが%sだとバイト数の理由が表示される',
    async (_label, password) => {
      await goToNewPasswordStep();

      await user.type(screen.getByLabelText('新しいパスワード'), password);
      await user.type(
        screen.getByLabelText('新しいパスワード（確認）'),
        password,
      );
      await user.click(screen.getByRole('button', { name: '変更する' }));

      await waitFor(() => {
        expect(
          screen.getByText(
            'パスワードは72バイト以内で入力してください（日本語は1文字3バイト）',
          ),
        ).toBeInTheDocument();
      });
      expect(mockChangePassword).not.toHaveBeenCalled();
    },
  );

  it('新パスワード確認が一致しないとバリデーションエラーが表示される', async () => {
    await goToNewPasswordStep();

    await user.type(
      screen.getByLabelText('新しいパスワード'),
      'NewPassword123',
    );
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      'Different123',
    );
    await user.click(screen.getByRole('button', { name: '変更する' }));

    await waitFor(() => {
      expect(screen.getByText('パスワードが一致しません')).toBeInTheDocument();
    });
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('パスワード変更成功時にトーストと成功メッセージが表示され初期画面に戻る', async () => {
    mockChangePassword.mockResolvedValue({
      success: true,
      message: 'パスワードを変更しました。',
    });

    await goToNewPasswordStep();

    await user.type(
      screen.getByLabelText('現在のパスワード'),
      'CurrentPassword1',
    );
    await user.type(screen.getByLabelText('新しいパスワード'), 'NewPassword1');
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      'NewPassword1',
    );
    await user.click(screen.getByRole('button', { name: '変更する' }));

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith({
        newPassword: 'NewPassword1',
        verificationToken: 'verification-token',
        currentPassword: 'CurrentPassword1',
      });
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'success' }),
      );
      // 初期画面（OTP送信ステップ）に戻る
      expect(
        screen.getByRole('button', { name: '確認コードを送信' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(
        'パスワードを変更しました。',
      );
    });
  });

  /**
   * 同じ画面に並ぶ二段階認証の節へ知らせる（#1372）
   *
   * ⛔ あちらは再認証でパスワードと確認コードのどちらを求めるかを
   * サーバーと同じ `users.password_hash` で決めるが、読むのはマウント時の
   * 1回だけ。設定画面は1ページなので再マウントされない。合図が無いと、
   * 初回パスワードを設定した直後は「確認コードを送る」しか出ないのに
   * サーバーはパスワードを要求する行き止まりが再読み込みまで続く。
   */
  it('パスワード変更成功時に他の節へ合図を出す（#1372）', async () => {
    mockChangePassword.mockResolvedValue({
      success: true,
      message: 'パスワードを変更しました。',
    });

    const listener = jest.fn();
    window.addEventListener(PASSWORD_CHANGE_EVENT, listener);

    await goToNewPasswordStep();

    await user.type(
      screen.getByLabelText('現在のパスワード'),
      'CurrentPassword1',
    );
    await user.type(screen.getByLabelText('新しいパスワード'), 'NewPassword1');
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      'NewPassword1',
    );
    await user.click(screen.getByRole('button', { name: '変更する' }));

    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));

    window.removeEventListener(PASSWORD_CHANGE_EVENT, listener);
  });

  /** ⚠️ 失敗したときは出さない。出すと他の節が無駄に取り直す */
  it('パスワード変更失敗時は合図を出さない（#1372）', async () => {
    mockChangePassword.mockRejectedValue(
      new AxiosError('Change failed', 'ERR_BAD_REQUEST'),
    );

    const listener = jest.fn();
    window.addEventListener(PASSWORD_CHANGE_EVENT, listener);

    await goToNewPasswordStep();

    await user.type(
      screen.getByLabelText('現在のパスワード'),
      'CurrentPassword1',
    );
    await user.type(screen.getByLabelText('新しいパスワード'), 'NewPassword1');
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      'NewPassword1',
    );
    await user.click(screen.getByRole('button', { name: '変更する' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener(PASSWORD_CHANGE_EVENT, listener);
  });

  it('パスワード変更失敗時にエラーが表示される', async () => {
    mockChangePassword.mockRejectedValue(
      new AxiosError('Change failed', 'ERR_BAD_REQUEST'),
    );

    await goToNewPasswordStep();

    await user.type(
      screen.getByLabelText('現在のパスワード'),
      'CurrentPassword1',
    );
    await user.type(screen.getByLabelText('新しいパスワード'), 'NewPassword1');
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      'NewPassword1',
    );
    await user.click(screen.getByRole('button', { name: '変更する' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
  });

  it('漏洩パスワードはサーバーの理由がそのまま表示される（#652）', async () => {
    // 漏洩照合はサーバー側でのみ行うため、クライアントには400で返ってくる
    const message =
      'このパスワードは過去の情報漏洩で確認されています。別のパスワードを設定してください';
    mockChangePassword.mockRejectedValue(
      new AxiosError('Bad Request', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 400,
        data: {
          success: false,
          error: { code: 'VALIDATION_ERROR', message },
        },
        statusText: 'Bad Request',
        headers: {},
        config: { headers: {} },
      } as never),
    );

    await goToNewPasswordStep();

    await user.type(
      screen.getByLabelText('現在のパスワード'),
      'CurrentPassword1',
    );
    await user.type(screen.getByLabelText('新しいパスワード'), 'NewPassword1');
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      'NewPassword1',
    );
    await user.click(screen.getByRole('button', { name: '変更する' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(message);
    });
  });
});

describe('ChangePasswordForm — 現在のパスワード欄（#643）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /** hasPassword を指定して新パスワード入力ステップまで進める */
  const goToStepWith = async (hasPassword: boolean) => {
    mockSendOtp.mockResolvedValueOnce({ success: true });

    render(
      <ChangePasswordForm email={defaultEmail} hasPassword={hasPassword} />,
    );

    await user.click(screen.getByRole('button', { name: '確認コードを送信' }));
    await waitFor(() => {
      expect(screen.getByTestId('otp-verification')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('otp-verify-success'));
    await waitFor(() => {
      expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
    });
  };

  it('パスワード設定済みなら「現在のパスワード」欄を表示する', async () => {
    await goToStepWith(true);

    expect(screen.getByLabelText('現在のパスワード')).toBeInTheDocument();
  });

  it('パスワード未設定なら「現在のパスワード」欄を表示しない', async () => {
    await goToStepWith(false);

    expect(screen.queryByLabelText('現在のパスワード')).not.toBeInTheDocument();
  });

  it('設定済みで現在のパスワードが未入力ならバリデーションエラーになる', async () => {
    await goToStepWith(true);

    await user.type(screen.getByLabelText('新しいパスワード'), 'NewPassword1');
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      'NewPassword1',
    );
    await user.click(screen.getByRole('button', { name: '変更する' }));

    await waitFor(() => {
      expect(
        screen.getByText('現在のパスワードを入力してください'),
      ).toBeInTheDocument();
    });
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('未設定なら現在のパスワード無しで送信できる', async () => {
    mockChangePassword.mockResolvedValue({
      success: true,
      message: 'パスワードを変更しました。',
    });

    await goToStepWith(false);

    await user.type(screen.getByLabelText('新しいパスワード'), 'NewPassword1');
    await user.type(
      screen.getByLabelText('新しいパスワード（確認）'),
      'NewPassword1',
    );
    await user.click(screen.getByRole('button', { name: '変更する' }));

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith(
        expect.objectContaining({ newPassword: 'NewPassword1' }),
      );
    });
  });
});
