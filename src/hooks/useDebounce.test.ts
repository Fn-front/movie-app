import { renderHook, act } from '@testing-library/react';

import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('初期値をそのまま返す', () => {
    const { result } = renderHook(() => useDebounce('initial', 500));

    expect(result.current).toBe('initial');
  });

  it('delay後に値が更新される', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } },
    );

    rerender({ value: 'updated', delay: 500 });

    // delay前は初期値のまま
    expect(result.current).toBe('initial');

    // delay経過後に値が更新される
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current).toBe('updated');
  });

  it('delay前に値が変更されると前のタイマーがキャンセルされる', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 500 } },
    );

    // 1回目の変更
    rerender({ value: 'first', delay: 500 });

    // 300ms経過（まだdelay未満）
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current).toBe('initial');

    // 2回目の変更（前のタイマーがキャンセルされる）
    rerender({ value: 'second', delay: 500 });

    // さらに300ms経過（1回目の変更から600ms、2回目から300ms）
    act(() => {
      jest.advanceTimersByTime(300);
    });

    // 2回目のタイマーはまだ完了していない
    expect(result.current).toBe('initial');

    // さらに200ms経過（2回目の変更から500ms）
    act(() => {
      jest.advanceTimersByTime(200);
    });

    // 2回目の値が反映される（1回目はスキップ）
    expect(result.current).toBe('second');
  });

  it('カスタムdelayが反映される', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 1000 } },
    );

    rerender({ value: 'updated', delay: 1000 });

    // 500ms経過（デフォルトの500msでは更新されない）
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current).toBe('initial');

    // さらに500ms経過（合計1000ms）
    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current).toBe('updated');
  });

  it('デフォルトdelayが500msで動作する', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value), {
      initialProps: { value: 'initial' },
    });

    rerender({ value: 'updated' });

    act(() => {
      jest.advanceTimersByTime(499);
    });

    expect(result.current).toBe('initial');

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(result.current).toBe('updated');
  });
});
