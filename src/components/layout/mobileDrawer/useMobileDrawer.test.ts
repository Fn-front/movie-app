import { renderHook, act } from '@testing-library/react';

import { useMobileDrawer } from './useMobileDrawer';

let mockPathname = '/';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

describe('useMobileDrawer', () => {
  beforeEach(() => {
    mockPathname = '/';
  });

  it('初期状態ではisOpenがfalse', () => {
    const { result } = renderHook(() => useMobileDrawer());
    expect(result.current.isOpen).toBe(false);
  });

  it('handleToggleでisOpenが切り替わる', () => {
    const { result } = renderHook(() => useMobileDrawer());

    act(() => {
      result.current.handleToggle();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.handleToggle();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('handleOpenChangeでisOpenが設定される', () => {
    const { result } = renderHook(() => useMobileDrawer());

    act(() => {
      result.current.handleOpenChange(true);
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.handleOpenChange(false);
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('境界値: 閉じている状態で pathname が変わっても閉じたまま（no-op）', () => {
    const { result, rerender } = renderHook(() => useMobileDrawer());

    // 初期状態で閉じている
    expect(result.current.isOpen).toBe(false);

    // パス変更
    mockPathname = '/settings';
    rerender();

    // 閉じたまま
    expect(result.current.isOpen).toBe(false);
  });

  it('pathname変更時にisOpenがfalseになる', () => {
    const { result, rerender } = renderHook(() => useMobileDrawer());

    act(() => {
      result.current.handleToggle();
    });
    expect(result.current.isOpen).toBe(true);

    // パス変更をシミュレート
    mockPathname = '/favorites';
    rerender();
    expect(result.current.isOpen).toBe(false);
  });
});
