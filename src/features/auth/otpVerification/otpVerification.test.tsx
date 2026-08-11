import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OtpVerification } from './otpVerification';

// --- Mocks ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

// --- Tests ---

describe('OtpVerification', () => {
  const user = userEvent.setup();
  const defaultProps = {
    email: 'test@example.com',
    action: 'registration' as const,
    onVerifySuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('コンポーネントが正しく表示される', () => {
    render(<OtpVerification {...defaultProps} />);

    expect(
      screen.getByRole('heading', { name: '確認コードを入力' }),
    ).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText(/に確認コードを送信しました/)).toBeInTheDocument();
    expect(screen.getByLabelText('確認コード')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '確認コードを検証' }),
    ).toBeInTheDocument();
  });

  it('初期状態でカウントダウンが表示される', () => {
    render(<OtpVerification {...defaultProps} />);

    expect(screen.getByText(/再送信まで/)).toBeInTheDocument();
  });

  it('カウントダウン完了後に再送信ボタンが表示される', async () => {
    render(<OtpVerification {...defaultProps} />);

    // カウントダウンを進める
    act(() => {
      jest.advanceTimersByTime(60 * 1000);
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '確認コードを再送信' }),
      ).toBeInTheDocument();
    });
  });

  it('OTP検証成功時にコールバックが呼ばれる', async () => {
    jest.useRealTimers();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: 'メール認証が完了しました',
      }),
    });

    render(<OtpVerification {...defaultProps} />);

    await user.type(screen.getByLabelText('確認コード'), '123456');
    await user.click(screen.getByRole('button', { name: '確認コードを検証' }));

    await waitFor(() => {
      expect(defaultProps.onVerifySuccess).toHaveBeenCalled();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/auth/otp/verify',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'test@example.com',
          code: '123456',
          action: 'registration',
        }),
      }),
    );
  });

  it('OTP検証失敗時にエラーメッセージが表示される', async () => {
    jest.useRealTimers();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: {
          message: '確認コードが間違っています。',
        },
      }),
    });

    render(<OtpVerification {...defaultProps} />);

    await user.type(screen.getByLabelText('確認コード'), '999999');
    await user.click(screen.getByRole('button', { name: '確認コードを検証' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(
        '確認コードが間違っています。',
      );
    });
  });

  it('数字以外を含むコードでバリデーションエラーが表示される（pattern境界値）', async () => {
    jest.useRealTimers();

    render(<OtpVerification {...defaultProps} />);

    await user.type(screen.getByLabelText('確認コード'), 'abcdef');
    await user.click(screen.getByRole('button', { name: '確認コードを検証' }));

    await waitFor(() => {
      expect(screen.getByText('数字のみ入力可能です')).toBeInTheDocument();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('input maxLength=6 で7桁以上の入力は6桁に切り詰められる（境界値）', async () => {
    jest.useRealTimers();

    render(<OtpVerification {...defaultProps} />);

    const input = screen.getByLabelText('確認コード') as HTMLInputElement;
    // ネイティブ maxLength により7桁目以降は入力されない
    expect(input.maxLength).toBe(6);

    await user.type(input, '1234567');
    expect(input.value).toBe('123456');
  });

  it('6桁未満のコードでバリデーションエラーが表示される', async () => {
    jest.useRealTimers();

    render(<OtpVerification {...defaultProps} />);

    await user.type(screen.getByLabelText('確認コード'), '123');
    await user.click(screen.getByRole('button', { name: '確認コードを検証' }));

    await waitFor(() => {
      expect(
        screen.getByText('6桁の数字を入力してください'),
      ).toBeInTheDocument();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('再送信が成功するとカウントダウンがリセットされる', async () => {
    render(<OtpVerification {...defaultProps} />);

    // カウントダウン完了
    act(() => {
      jest.advanceTimersByTime(60 * 1000);
    });

    jest.useRealTimers();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: '確認コードを再送信しました',
      }),
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: '確認コードを再送信' }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: '確認コードを再送信' }),
    );

    await waitFor(() => {
      expect(screen.getByText(/再送信まで/)).toBeInTheDocument();
    });
  });
});
