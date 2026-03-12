/**
 * useOtpVerification カスタムフック テスト
 */

import { renderHook, act } from '@testing-library/react';

import { useOtpVerification } from './useOtpVerification';

// --- Mocks ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

// --- Tests ---

describe('useOtpVerification', () => {
  const defaultProps = {
    email: 'test@example.com',
    action: 'registration' as const,
    onVerifySuccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('初期状態が正しい', () => {
    const { result } = renderHook(() => useOtpVerification(defaultProps));

    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.isResending).toBe(false);
    expect(result.current.resendCountdown).toBe(60);
    expect(result.current.canResend).toBe(false);
    expect(result.current.apiError).toBeNull();
    expect(result.current.remainingAttempts).toBeNull();
  });

  it('カウントダウンが正しく動作する', () => {
    const { result } = renderHook(() => useOtpVerification(defaultProps));

    expect(result.current.resendCountdown).toBe(60);

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.resendCountdown).toBe(59);

    act(() => {
      jest.advanceTimersByTime(59 * 1000);
    });
    expect(result.current.resendCountdown).toBe(0);
    expect(result.current.canResend).toBe(true);
  });

  it('handleVerify: 成功時にonVerifySuccessが呼ばれる', async () => {
    jest.useRealTimers();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() => useOtpVerification(defaultProps));

    await act(async () => {
      await result.current.handleVerify('123456');
    });

    expect(defaultProps.onVerifySuccess).toHaveBeenCalled();
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

  it('handleVerify: 失敗時にエラーと残り試行回数が設定される', async () => {
    jest.useRealTimers();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: {
          message: 'コードが間違っています',
          details: { remainingAttempts: 3 },
        },
      }),
    });

    const { result } = renderHook(() => useOtpVerification(defaultProps));

    await act(async () => {
      await result.current.handleVerify('999999');
    });

    expect(result.current.apiError).toBe('コードが間違っています');
    expect(result.current.remainingAttempts).toBe(3);
    expect(defaultProps.onVerifySuccess).not.toHaveBeenCalled();
  });

  it('handleResend: 成功時にカウントダウンがリセットされる', async () => {
    const { result } = renderHook(() => useOtpVerification(defaultProps));

    // カウントダウン完了
    act(() => {
      jest.advanceTimersByTime(60 * 1000);
    });
    expect(result.current.canResend).toBe(true);

    jest.useRealTimers();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    await act(async () => {
      await result.current.handleResend();
    });

    expect(result.current.resendCountdown).toBe(60);
    expect(result.current.canResend).toBe(false);
  });

  it('handleVerify: ネットワークエラー時にエラーメッセージが設定される', async () => {
    jest.useRealTimers();

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useOtpVerification(defaultProps));

    await act(async () => {
      await result.current.handleVerify('123456');
    });

    expect(result.current.apiError).toBe('ネットワークエラーが発生しました。');
  });

  it('handleResend: APIエラー時にエラーメッセージが設定される', async () => {
    const { result } = renderHook(() => useOtpVerification(defaultProps));

    act(() => {
      jest.advanceTimersByTime(60 * 1000);
    });

    jest.useRealTimers();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: { message: '再送信間隔が短すぎます。' },
      }),
    });

    await act(async () => {
      await result.current.handleResend();
    });

    expect(result.current.apiError).toBe('再送信間隔が短すぎます。');
    // カウントダウンはリセットされない
    expect(result.current.resendCountdown).toBe(0);
  });

  it('handleResend: APIエラーでメッセージがない場合デフォルトメッセージが設定される', async () => {
    const { result } = renderHook(() => useOtpVerification(defaultProps));

    act(() => {
      jest.advanceTimersByTime(60 * 1000);
    });

    jest.useRealTimers();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    await act(async () => {
      await result.current.handleResend();
    });

    expect(result.current.apiError).toBe('再送信に失敗しました。');
  });

  it('handleResend: ネットワークエラー時にエラーメッセージが設定される', async () => {
    const { result } = renderHook(() => useOtpVerification(defaultProps));

    act(() => {
      jest.advanceTimersByTime(60 * 1000);
    });

    jest.useRealTimers();

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      await result.current.handleResend();
    });

    expect(result.current.apiError).toBe('ネットワークエラーが発生しました。');
  });
});
