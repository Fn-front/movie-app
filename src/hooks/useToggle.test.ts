import { renderHook, act } from '@testing-library/react';

import { useToggle } from './useToggle';

describe('useToggle', () => {
  it('デフォルトはfalse', () => {
    const { result } = renderHook(() => useToggle());

    expect(result.current[0]).toBe(false);
  });

  it('initialValueを指定できる', () => {
    const { result } = renderHook(() => useToggle(true));

    expect(result.current[0]).toBe(true);
  });

  it('toggle関数で値が反転する', () => {
    const { result } = renderHook(() => useToggle(false));

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe(true);

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe(false);
  });

  it('setTrue関数でtrueになる', () => {
    const { result } = renderHook(() => useToggle(false));

    act(() => {
      result.current[2]();
    });

    expect(result.current[0]).toBe(true);
  });

  it('setFalse関数でfalseになる', () => {
    const { result } = renderHook(() => useToggle(true));

    act(() => {
      result.current[3]();
    });

    expect(result.current[0]).toBe(false);
  });
});
