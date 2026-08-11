import { renderHook } from '@testing-library/react';

import { usePrevious } from './usePrevious';

describe('usePrevious', () => {
  it('初回はundefinedを返す', () => {
    const { result } = renderHook(() => usePrevious('initial'));

    expect(result.current).toBeUndefined();
  });

  it('値が変更されると前の値を返す', () => {
    const { result, rerender } = renderHook(({ value }) => usePrevious(value), {
      initialProps: { value: 'first' },
    });

    expect(result.current).toBeUndefined();

    rerender({ value: 'second' });

    expect(result.current).toBe('first');
  });

  it('境界値: 同じ値で再レンダーすると前回値も同じ値になる', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => usePrevious(value),
      { initialProps: { value: 'stable' } },
    );

    // 初回
    expect(result.current).toBeUndefined();

    // 同じ値で再レンダー
    rerender({ value: 'stable' });
    expect(result.current).toBe('stable');

    // もう一度同じ値
    rerender({ value: 'stable' });
    expect(result.current).toBe('stable');
  });

  it('境界値: undefined/null も前回値として保持される', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string | null | undefined }) => usePrevious(value),
      { initialProps: { value: 'first' as string | null | undefined } },
    );

    rerender({ value: null });
    expect(result.current).toBe('first');

    rerender({ value: undefined });
    expect(result.current).toBe(null);
  });

  it('複数回変更で直前の値を返す', () => {
    const { result, rerender } = renderHook(({ value }) => usePrevious(value), {
      initialProps: { value: 'first' },
    });

    expect(result.current).toBeUndefined();

    rerender({ value: 'second' });
    expect(result.current).toBe('first');

    rerender({ value: 'third' });
    expect(result.current).toBe('second');

    rerender({ value: 'fourth' });
    expect(result.current).toBe('third');
  });
});
