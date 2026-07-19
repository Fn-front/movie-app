/**
 * useTheaterSelection フック テスト
 */

import { act, renderHook } from '@testing-library/react';

import { useTheaterSelection } from './useTheaterSelection';

const mockReplace = jest.fn();
const MOCK_PATHNAME = '/theater-experience';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => MOCK_PATHNAME,
}));

describe('useTheaterSelection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', MOCK_PATHNAME);
  });

  it('初期slugを返す', () => {
    const { result } = renderHook(() => useTheaterSelection('standard-medium'));

    expect(result.current.slug).toBe('standard-medium');
  });

  it('selectTheaterでslugが更新されURLクエリに反映される', () => {
    const { result } = renderHook(() => useTheaterSelection('standard-medium'));

    act(() => {
      result.current.selectTheater('imax-gt');
    });

    expect(result.current.slug).toBe('imax-gt');
    expect(mockReplace).toHaveBeenCalledWith(
      '/theater-experience?theater=imax-gt',
      { scroll: false },
    );
  });

  it('同じslugを選択した場合はURLを更新しない', () => {
    const { result } = renderHook(() => useTheaterSelection('standard-medium'));

    act(() => {
      result.current.selectTheater('standard-medium');
    });

    expect(result.current.slug).toBe('standard-medium');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('特殊文字を含むslugはURLエンコードされる', () => {
    const { result } = renderHook(() => useTheaterSelection('standard-medium'));

    act(() => {
      result.current.selectTheater('a b&c');
    });

    expect(mockReplace).toHaveBeenCalledWith(
      '/theater-experience?theater=a+b%26c',
      { scroll: false },
    );
  });

  it('既存のクエリを保持したまま theater を更新する', () => {
    window.history.replaceState({}, '', `${MOCK_PATHNAME}?foo=bar`);
    const { result } = renderHook(() => useTheaterSelection('standard-medium'));

    act(() => {
      result.current.selectTheater('imax-gt');
    });

    expect(mockReplace).toHaveBeenCalledWith(
      '/theater-experience?foo=bar&theater=imax-gt',
      { scroll: false },
    );
  });
});
