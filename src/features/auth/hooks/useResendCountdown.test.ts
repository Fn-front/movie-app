import { act, renderHook } from '@testing-library/react';

import { useResendCountdown } from './useResendCountdown';

describe('useResendCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('指定した秒数から数え始める', () => {
    const { result } = renderHook(() => useResendCountdown(60));

    expect(result.current.remaining).toBe(60);
    expect(result.current.canResend).toBe(false);
  });

  it('1秒ごとに減る', () => {
    const { result } = renderHook(() => useResendCountdown(60));

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(result.current.remaining).toBe(57);
  });

  it('0になったら再送できる', () => {
    const { result } = renderHook(() => useResendCountdown(2));

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(result.current.remaining).toBe(0);
    expect(result.current.canResend).toBe(true);
  });

  it('0を下回らない', () => {
    const { result } = renderHook(() => useResendCountdown(1));

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(result.current.remaining).toBe(0);
  });

  it('restart で数え直す', () => {
    const { result } = renderHook(() => useResendCountdown(60));

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current.canResend).toBe(true);

    act(() => {
      result.current.restart();
    });

    expect(result.current.remaining).toBe(60);
    expect(result.current.canResend).toBe(false);
  });

  it('アンマウントでタイマーを止める', () => {
    const clearSpy = jest.spyOn(global, 'clearInterval');
    const { unmount } = renderHook(() => useResendCountdown(60));

    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
