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
